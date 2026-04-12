"""
database.py — Conexão SQLite e queries do SmartZoo Backend
Usa sqlite3 nativo do Python (sem ORM).
"""

import sqlite3
import os
import logging
from typing import Optional
from config import DB_PATH, SNAPSHOTS_DIR, CAGE_HEARTBEAT_TIMEOUT

logger = logging.getLogger(__name__)


def get_connection() -> sqlite3.Connection:
    """Retorna uma conexão SQLite com row_factory configurado."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")  # melhor concorrência
    conn.execute("PRAGMA foreign_keys=ON;")
    return conn


def init_db() -> None:
    """Cria as tabelas e índices caso não existam."""
    os.makedirs(SNAPSHOTS_DIR, exist_ok=True)

    conn = get_connection()
    try:
        cur = conn.cursor()

        cur.executescript("""
            CREATE TABLE IF NOT EXISTS cages (
                id          TEXT PRIMARY KEY,
                animal_name TEXT NOT NULL,
                species     TEXT,
                location_x  REAL,
                location_y  REAL,
                zoo_area    TEXT
            );

            CREATE TABLE IF NOT EXISTS cage_zones (
                cage_id     TEXT REFERENCES cages(id),
                zone_key    TEXT NOT NULL,
                description TEXT NOT NULL,
                PRIMARY KEY (cage_id, zone_key)
            );

            CREATE TABLE IF NOT EXISTS activity_log (
                id             INTEGER PRIMARY KEY AUTOINCREMENT,
                cage_id        TEXT REFERENCES cages(id),
                status         TEXT CHECK(status IN ('active', 'inactive')),
                zone           TEXT,
                zone_label     TEXT,
                activity_level REAL,
                animal_count   INTEGER,
                timestamp      DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS snapshots (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                cage_id     TEXT REFERENCES cages(id),
                image_path  TEXT,
                timestamp   DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_activity_cage_ts
                ON activity_log(cage_id, timestamp);

            CREATE INDEX IF NOT EXISTS idx_snapshots_cage_ts
                ON snapshots(cage_id, timestamp);
        """)
        conn.commit()

        # Migração: adiciona zoo_area se não existir (bancos antigos)
        cols = [r[1] for r in cur.execute("PRAGMA table_info(cages)").fetchall()]
        if "zoo_area" not in cols:
            cur.execute("ALTER TABLE cages ADD COLUMN zoo_area TEXT")
            conn.commit()
            logger.info("Coluna zoo_area adicionada à tabela cages.")

        logger.info("Banco de dados inicializado em: %s", DB_PATH)
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Queries — cages
# ---------------------------------------------------------------------------

def upsert_cage_minimal(cage_id: str) -> None:
    """Garante que a jaula exista com dados mínimos."""
    conn = get_connection()
    try:
        conn.execute(
            "INSERT OR IGNORE INTO cages (id, animal_name) VALUES (?, ?)",
            (cage_id, cage_id),
        )
        conn.commit()
    finally:
        conn.close()


def get_all_cages():
    """Retorna todas as jaulas cadastradas."""
    conn = get_connection()
    try:
        rows = conn.execute("SELECT * FROM cages").fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Queries — cage_zones
# ---------------------------------------------------------------------------

def get_zone_label(cage_id: str, zone_key: str) -> Optional[str]:
    """Retorna a descrição legível de uma zona, ou None se não mapeada."""
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT description FROM cage_zones WHERE cage_id = ? AND zone_key = ?",
            (cage_id, zone_key),
        ).fetchone()
        return row["description"] if row else None
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Queries — activity_log
# ---------------------------------------------------------------------------

def insert_activity(
    cage_id: str,
    status: str,
    zone: Optional[str],
    zone_label: Optional[str],
    activity_level: float,
    animal_count: int,
) -> None:
    conn = get_connection()
    try:
        conn.execute(
            """
            INSERT INTO activity_log
                (cage_id, status, zone, zone_label, activity_level, animal_count)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (cage_id, status, zone, zone_label, activity_level, animal_count),
        )
        conn.commit()
    finally:
        conn.close()


def get_latest_status_all():
    """
    Retorna a última entrada de activity_log para cada jaula,
    enriquecida com dados de cages.
    Jaulas sem mensagem há mais de CAGE_HEARTBEAT_TIMEOUT segundos
    são automaticamente reportadas como 'inactive'.
    """
    conn = get_connection()
    try:
        rows = conn.execute(
            f"""
            SELECT
                a.cage_id,
                c.animal_name,
                c.species,
                c.location_x,
                c.location_y,
                CASE
                    WHEN (julianday('now') - julianday(a.timestamp)) * 86400 > {CAGE_HEARTBEAT_TIMEOUT}
                    THEN 'inactive'
                    ELSE a.status
                END AS status,
                a.activity_level,
                a.animal_count,
                a.zone,
                a.zone_label,
                a.timestamp AS last_update
            FROM activity_log a
            JOIN cages c ON c.id = a.cage_id
            WHERE a.id = (
                SELECT id FROM activity_log
                WHERE cage_id = a.cage_id
                ORDER BY timestamp DESC
                LIMIT 1
            )
            ORDER BY c.animal_name
            """
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def get_cage_history_24h(cage_id: str):
    """
    Retorna activity_ratio por hora das últimas 24h para uma jaula.
    active_ratio = fração de registros com status='active' naquela hora.
    """
    conn = get_connection()
    try:
        rows = conn.execute(
            """
            SELECT
                strftime('%Y-%m-%dT%H:00:00', timestamp) AS hour,
                AVG(CASE WHEN status = 'active' THEN 1.0 ELSE 0.0 END) AS active_ratio,
                COUNT(*) AS count
            FROM activity_log
            WHERE cage_id = ?
              AND timestamp >= datetime('now', '-24 hours')
            GROUP BY hour
            ORDER BY hour
            """,
            (cage_id,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def get_activity_context_all():
    """
    Retorna para cada jaula: animal_name, species, status atual e
    picos de atividade (hora com maior active_ratio nos últimos 7 dias).
    Usado para montar o contexto do chatbot.
    """
    conn = get_connection()
    try:
        # Status atual
        latest = get_latest_status_all()

        # Horários de pico por jaula (top 3)
        peaks = conn.execute(
            """
            SELECT
                cage_id,
                CAST(strftime('%H', timestamp) AS INTEGER) AS hour,
                AVG(CASE WHEN status = 'active' THEN 1.0 ELSE 0.0 END) AS active_ratio
            FROM activity_log
            WHERE timestamp >= datetime('now', '-7 days')
            GROUP BY cage_id, hour
            ORDER BY cage_id, active_ratio DESC
            """
        ).fetchall()
        conn.close()

        peaks_map: dict = {}
        for p in peaks:
            cid = p["cage_id"]
            if cid not in peaks_map:
                peaks_map[cid] = []
            if len(peaks_map[cid]) < 3:
                peaks_map[cid].append(
                    {"hour": p["hour"], "active_ratio": round(p["active_ratio"], 2)}
                )

        def _period(hour: int) -> str:
            if 6 <= hour < 12:
                return "manhã"
            if 12 <= hour < 18:
                return "tarde"
            if 18 <= hour < 24:
                return "noite"
            return "madrugada"

        result = []
        for row in latest:
            cid = row["cage_id"]
            peaks = peaks_map.get(cid, [])
            peak_periods = list(dict.fromkeys(_period(p["hour"]) for p in peaks))
            result.append(
                {
                    "cage_id": cid,
                    "animal_name": row["animal_name"],
                    "species": row.get("species"),
                    "status": row["status"],
                    "activity_level": round(row["activity_level"], 2),
                    "zoo_area": row.get("zoo_area") or "não informada",
                    "peak_periods": peak_periods,
                }
            )
        return result
    except Exception:
        conn.close()
        raise


# ---------------------------------------------------------------------------
# Queries — route suggestion
# ---------------------------------------------------------------------------

def get_route_activity_by_hour_window(hour: int):
    """
    Para cada jaula, retorna active_ratio médio considerando
    registros do banco onde hora ∈ [H-1, H+1] nos últimos 7 dias.
    """
    h_minus = (hour - 1) % 24
    h_plus = (hour + 1) % 24

    conn = get_connection()
    try:
        # Montamos a cláusula de hora de forma que funcione em viradas de dia
        if h_minus <= h_plus:
            hour_filter = "CAST(strftime('%H', timestamp) AS INTEGER) BETWEEN ? AND ?"
            params = (h_minus, h_plus)
        else:
            # ex: hora=0 → -1=23, +1=1 → precisa de OR
            hour_filter = (
                "CAST(strftime('%H', timestamp) AS INTEGER) >= ? "
                "OR CAST(strftime('%H', timestamp) AS INTEGER) <= ?"
            )
            params = (h_minus, h_plus)

        rows = conn.execute(
            f"""
            SELECT
                a.cage_id,
                c.animal_name,
                AVG(CASE WHEN a.status = 'active' THEN 1.0 ELSE 0.0 END) AS expected_activity
            FROM activity_log a
            JOIN cages c ON c.id = a.cage_id
            WHERE a.timestamp >= datetime('now', '-7 days')
              AND ({hour_filter})
            GROUP BY a.cage_id
            ORDER BY expected_activity DESC
            """,
            params,
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Queries — snapshots
# ---------------------------------------------------------------------------

def insert_snapshot(cage_id: str, image_path: str) -> None:
    conn = get_connection()
    try:
        conn.execute(
            "INSERT INTO snapshots (cage_id, image_path) VALUES (?, ?)",
            (cage_id, image_path),
        )
        conn.commit()
    finally:
        conn.close()


def get_latest_snapshot(cage_id: str) -> Optional[dict]:
    conn = get_connection()
    try:
        row = conn.execute(
            """
            SELECT image_path, timestamp
            FROM snapshots
            WHERE cage_id = ?
            ORDER BY timestamp DESC
            LIMIT 1
            """,
            (cage_id,),
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()
