"""
seed_cages.py — Popula / atualiza metadados das jaulas no banco SmartZoo.

Execute uma vez após criar o banco:
    python3 seed_cages.py

Pode ser re-executado a qualquer momento (usa UPSERT, não duplica registros).
"""

import sqlite3
import os
import sys

DB_PATH = os.environ.get("DB_PATH", os.path.join(os.path.dirname(__file__), "smartzoo.db"))

CAGES = [
    # id, animal_name, species, location_x, location_y
    ("cage01", "Leão",        "Panthera leo",             0.27, 0.60),
    ("cage02", "Elefante",    "Loxodonta africana",       0.68, 0.22),
    ("cage03", "Girafa",      "Giraffa camelopardalis",   0.63, 0.38),
    ("cage04", "Hipopótamo",  "Hippopotamus amphibius",   0.52, 0.72),
    ("cage05", "Zebra",       "Equus quagga",             0.21, 0.45),
    ("cage06", "Gorila",      "Gorilla gorilla",          0.60, 0.55),
    ("cage07", "Flamingo",    "Phoenicopterus roseus",    0.83, 0.58),
]

# Descrições de zona em português — aplicadas a todas as jaulas
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


def seed():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL;")
    cur = conn.cursor()

    # Jaulas
    for cage_id, name, species, lx, ly in CAGES:
        cur.execute(
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
        print(f"  {cage_id}: {name}  pos=({lx}, {ly})")

    # Zonas
    for cage_id, _, _, _, _ in CAGES:
        for zone_key, description in ZONE_LABELS:
            cur.execute(
                """
                INSERT INTO cage_zones (cage_id, zone_key, description)
                VALUES (?, ?, ?)
                ON CONFLICT(cage_id, zone_key) DO UPDATE SET
                    description = excluded.description
                """,
                (cage_id, zone_key, description),
            )
    print(f"  Zonas configuradas para {len(CAGES)} jaulas.")

    conn.commit()
    conn.close()
    print("Seed concluído.")


if __name__ == "__main__":
    if not os.path.exists(DB_PATH):
        print(f"Banco não encontrado em: {DB_PATH}", file=sys.stderr)
        sys.exit(1)
    print(f"Atualizando banco: {DB_PATH}")
    seed()
