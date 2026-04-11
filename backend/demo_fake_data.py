"""
demo_fake_data.py — Publica dados fake de 5 jaulas para demonstração.

Faz duas coisas:
  1. Seed direto no banco SQLite (metadados + histórico 24h fake)
  2. Loop MQTT publicando status + snapshots (imagens reais de cada animal)

Execute na máquina onde o backend roda:
    python3 demo_fake_data.py

Flags úteis:
    --broker  HOST    (padrão: localhost)
    --once            apenas seed + 1 round de publicação (sem loop)
    --no-history      pula inserção de histórico fake
"""

from __future__ import annotations

import argparse
import base64
import io
import json
import logging
import math
import os
import random
import sqlite3
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone

import paho.mqtt.client as mqtt

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Banco — mesmo caminho que config.py usa
# ---------------------------------------------------------------------------
DB_PATH = os.environ.get(
    "DB_PATH",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "smartzoo.db"),
)

# ---------------------------------------------------------------------------
# Definição dos animais fake
# ---------------------------------------------------------------------------
#   cage_id, nome, espécie, pos_x, pos_y, url_imagem_wikimedia
ANIMALS = [
    (
        "cage03", "Girafa", "Giraffa camelopardalis",
        0.63, 0.38,
        "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Giraffe_Mikumi_National_Park.jpg/320px-Giraffe_Mikumi_National_Park.jpg",
    ),
    (
        "cage04", "Hipopótamo", "Hippopotamus amphibius",
        0.52, 0.72,
        "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1c/Hippo_in_Tanzania_3921_Nevit.jpg/320px-Hippo_in_Tanzania_3921_Nevit.jpg",
    ),
    (
        "cage05", "Zebra", "Equus quagga",
        0.21, 0.45,
        "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e3/Plains_Zebra_Equus_quagga.jpg/320px-Plains_Zebra_Equus_quagga.jpg",
    ),
    (
        "cage06", "Gorila", "Gorilla gorilla",
        0.60, 0.55,
        "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b7/Western_Lowland_Gorilla_at_Auckland_Zoo_-_27April2010.jpg/320px-Western_Lowland_Gorilla_at_Auckland_Zoo_-_27April2010.jpg",
    ),
    (
        "cage07", "Flamingo", "Phoenicopterus roseus",
        0.83, 0.58,
        "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b6/FLAMINGO_4.jpg/320px-FLAMINGO_4.jpg",
    ),
]

# Padrão de atividade por hora (0-23) para cada animal — dá personalidade ao gráfico
ACTIVITY_PROFILES = {
    "cage03": [10,5,5,5,5,10,30,60,75,80,85,70,55,65,80,85,75,60,40,30,20,15,10,5],   # Girafa: manhã/tarde
    "cage04": [5,5,5,5,5,5,10,20,30,40,50,55,60,55,45,35,30,40,50,40,30,20,10,5],     # Hipopótamo: tarde
    "cage05": [5,5,5,5,5,10,40,70,85,80,70,60,50,60,75,80,75,65,50,35,20,15,10,5],    # Zebra: manhã/tarde
    "cage06": [5,5,5,5,5,5,15,25,40,60,70,75,65,70,75,70,60,50,40,30,20,10,5,5],      # Gorila: ao longo do dia
    "cage07": [5,5,5,5,5,10,20,35,50,60,65,70,65,60,70,75,70,55,40,25,15,10,5,5],     # Flamingo: tarde
}

ZONES = ["top_left","top_center","top_right","left","center","right","bottom_left","bottom_center","bottom_right"]

# ---------------------------------------------------------------------------
# Seed banco
# ---------------------------------------------------------------------------

ZONE_LABELS = [
    ("top_left",       "Canto esquerdo ao fundo"),
    ("top_center",     "Ao fundo, área central"),
    ("top_right",      "Canto direito ao fundo"),
    ("left",           "Lateral esquerda"),
    ("center",         "Centro do recinto"),
    ("right",          "Lateral direita"),
    ("bottom_left",    "Canto esquerdo na frente"),
    ("bottom_center",  "Área central na frente"),
    ("bottom_right",   "Canto direito na frente"),
]


def seed_cages(conn: sqlite3.Connection) -> None:
    """Insere / atualiza metadados das jaulas fake + labels de zona."""
    for cage_id, name, species, lx, ly, _ in ANIMALS:
        conn.execute(
            """
            INSERT INTO cages (id, animal_name, species, location_x, location_y)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                animal_name = excluded.animal_name,
                species     = excluded.species,
                location_x  = excluded.location_x,
                location_y  = excluded.location_y
            """,
            (cage_id, name, species, lx, ly),
        )
        for zone_key, description in ZONE_LABELS:
            conn.execute(
                """
                INSERT INTO cage_zones (cage_id, zone_key, description)
                VALUES (?, ?, ?)
                ON CONFLICT(cage_id, zone_key) DO UPDATE SET
                    description = excluded.description
                """,
                (cage_id, zone_key, description),
            )
        logger.info("  Cage seeded: %s (%s)", cage_id, name)
    conn.commit()


def seed_history(conn: sqlite3.Connection) -> None:
    """
    Insere entradas de activity_log simulando as últimas 24 horas.
    Uma entrada a cada 10 minutos por jaula (144 entradas × 5 jaulas).
    """
    now = datetime.now(tz=timezone.utc)
    inserted = 0

    for cage_id, _, _, _, _, _ in ANIMALS:
        profile = ACTIVITY_PROFILES.get(cage_id, [50] * 24)
        for minutes_ago in range(0, 24 * 60, 10):
            ts = now - timedelta(minutes=minutes_ago)
            hour = ts.hour
            base_pct = profile[hour]
            # Adiciona ruído ±15%
            activity = min(100, max(0, base_pct + random.randint(-15, 15))) / 100.0
            status = "active" if activity > 0.15 else "inactive"
            zone = random.choice(ZONES) if status == "active" else None
            zone_label = dict(ZONE_LABELS).get(zone) if zone else None
            conn.execute(
                """
                INSERT INTO activity_log
                    (cage_id, status, zone, zone_label, activity_level, animal_count, timestamp)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    cage_id, status, zone, zone_label,
                    round(activity, 3),
                    1 if status == "active" else 0,
                    ts.strftime("%Y-%m-%d %H:%M:%S"),
                ),
            )
            inserted += 1

    conn.commit()
    logger.info("  Histórico inserido: %d entradas", inserted)


# ---------------------------------------------------------------------------
# Download de imagens
# ---------------------------------------------------------------------------

def download_image_b64(url: str, cage_id: str) -> str | None:
    """Baixa imagem da URL e retorna como base64 JPEG string. Retenta em 429."""
    cache_path = os.path.join(os.path.dirname(DB_PATH), f"_demo_img_{cage_id}.jpg")
    if os.path.exists(cache_path) and os.path.getsize(cache_path) > 1000:
        with open(cache_path, "rb") as f:
            return base64.b64encode(f.read()).decode("ascii")

    logger.info("  Baixando imagem: %s", url)
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": "Mozilla/5.0 (compatible; SmartZooDemo/1.0)"
            })
            with urllib.request.urlopen(req, timeout=20) as resp:
                data = resp.read()
            with open(cache_path, "wb") as f:
                f.write(data)
            logger.info("  Imagem salva (%d bytes)", len(data))
            return base64.b64encode(data).decode("ascii")
        except Exception as exc:
            wait = (attempt + 1) * 5
            logger.warning("  Tentativa %d falhou: %s — aguardando %ds...", attempt + 1, exc, wait)
            time.sleep(wait)
    logger.error("  Desistindo de %s após 5 tentativas", cage_id)
    return None


# ---------------------------------------------------------------------------
# MQTT publish
# ---------------------------------------------------------------------------

def publish_round(client: mqtt.Client, images: dict[str, str | None]) -> None:
    """Publica uma rodada de status + snapshot para todas as jaulas fake."""
    now = time.time()
    for cage_id, name, species, lx, ly, _ in ANIMALS:
        profile = ACTIVITY_PROFILES.get(cage_id, [50] * 24)
        hour = datetime.now().hour
        base_pct = profile[hour] / 100.0
        # Demo: garante mínimo de 40% para sempre ter animais visíveis
        base_pct = max(base_pct, 0.40)
        activity = min(1.0, max(0.0, base_pct + random.uniform(-0.1, 0.1)))
        status = "active" if activity > 0.15 else "inactive"
        zone = random.choice(ZONES) if status == "active" else "unknown"

        payload = {
            "cage_id":        cage_id,
            "status":         status,
            "activity_level": round(activity, 3),
            "animal_count":   1 if status == "active" else 0,
            "zone":           zone,
            "uptime_ms":      int(now * 1000) % (24 * 3600 * 1000),
        }
        topic_status = f"zoo/cage/{cage_id}/status"
        client.publish(topic_status, json.dumps(payload))
        logger.info("[MQTT] %s → %s (%.0f%%)", cage_id, status, activity * 100)

        # Snapshot
        img_b64 = images.get(cage_id)
        if img_b64:
            topic_snap = f"zoo/cage/{cage_id}/snapshot"
            client.publish(topic_snap, img_b64)
            logger.info("[MQTT] %s → snapshot publicado", cage_id)

    time.sleep(0.5)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def parse_args():
    p = argparse.ArgumentParser(description="SmartZoo demo fake data publisher")
    p.add_argument("--broker",      default="localhost", help="Host do broker MQTT")
    p.add_argument("--port",        type=int, default=1883)
    p.add_argument("--interval",    type=int, default=15,
                   help="Segundos entre rodadas de publicação (padrão: 15)")
    p.add_argument("--once",        action="store_true",
                   help="Publica uma vez e sai")
    p.add_argument("--no-history",  action="store_true",
                   help="Pula inserção de histórico fake no banco")
    return p.parse_args()


def main():
    args = parse_args()

    if not os.path.exists(DB_PATH):
        logger.error("Banco não encontrado: %s", DB_PATH)
        logger.error("Execute o backend ao menos uma vez para criar o banco.")
        sys.exit(1)

    # --- Seed banco ---
    logger.info("=== Seed banco: %s ===", DB_PATH)
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL;")
    seed_cages(conn)
    if not args.no_history:
        logger.info("Inserindo histórico fake (24h)...")
        seed_history(conn)
    conn.close()

    # --- Download imagens + salva direto no banco ---
    logger.info("=== Download de imagens ===")
    images: dict[str, str | None] = {}
    # Usa mesmo diretório do banco para garantir que o backend encontra os arquivos
    backend_dir = os.path.dirname(os.path.abspath(DB_PATH))
    snapshots_dir = os.path.abspath(
        os.environ.get("SNAPSHOTS_DIR", os.path.join(backend_dir, "snapshots"))
    )
    os.makedirs(snapshots_dir, exist_ok=True)
    logger.info("  Snapshots dir: %s", snapshots_dir)
    snap_conn = sqlite3.connect(DB_PATH)
    snap_conn.execute("PRAGMA journal_mode=WAL;")
    for cage_id, _, _, _, _, url in ANIMALS:
        cache_path = os.path.join(backend_dir, f"_demo_img_{cage_id}.jpg")
        b64 = download_image_b64(url, cage_id)
        time.sleep(3)  # evita rate limit do Wikimedia
        images[cage_id] = b64
        if b64:
            try:
                img_bytes = base64.b64decode(b64)
                ts = datetime.now(tz=timezone.utc).strftime("%Y%m%d_%H%M%S")
                fname = f"{cage_id}_{ts}.jpg"
                fpath = os.path.join(snapshots_dir, fname)
                with open(fpath, "wb") as f:
                    f.write(img_bytes)
                snap_conn.execute(
                    "INSERT INTO snapshots (cage_id, image_path) VALUES (?, ?)",
                    (cage_id, fpath),
                )
                snap_conn.commit()
                logger.info("  Snapshot salvo: %s (%d bytes)", fpath, len(img_bytes))
            except Exception as exc:
                logger.error("  ERRO ao salvar snapshot %s: %s", cage_id, exc)
        else:
            logger.warning("  Sem imagem para %s — pulando snapshot", cage_id)
    snap_conn.close()

    # --- MQTT ---
    logger.info("=== Conectando MQTT %s:%d ===", args.broker, args.port)
    client = mqtt.Client(client_id="demo_fake_publisher", clean_session=True)
    client.connect(args.broker, args.port, keepalive=60)
    client.loop_start()
    time.sleep(1)

    if args.once:
        publish_round(client, images)
    else:
        logger.info("Publicando a cada %ds. Ctrl+C para parar.", args.interval)
        try:
            while True:
                publish_round(client, images)
                time.sleep(args.interval)
        except KeyboardInterrupt:
            logger.info("Interrompido.")

    client.loop_stop()
    client.disconnect()
    logger.info("Concluído.")


if __name__ == "__main__":
    main()
