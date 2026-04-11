"""
seed_cages.py — Popula / atualiza metadados das jaulas no banco SmartZoo.

Execute uma vez após criar o banco:
    python3 seed_cages.py

Pode ser re-executado a qualquer momento (usa UPSERT, não duplica registros).
"""

import sqlite3
import os
import sys

# Localiza o banco pelo mesmo caminho que config.py usa
DB_PATH = os.environ.get("DB_PATH", os.path.join(os.path.dirname(__file__), "smartzoo.db"))

CAGES = [
    # id, animal_name, species, location_x, location_y
    ("cage01", "Leão",        "Panthera leo",             0.27, 0.60),
    ("cage02", "Elefante",    "Loxodonta africana",       0.68, 0.22),
    ("cage03", "Girafa",      "Giraffa camelopardalis",   0.38, 0.22),
    ("cage04", "Hipopótamo",  "Hippopotamus amphibius",   0.52, 0.72),
    ("cage05", "Zebra",       "Equus quagga",             0.21, 0.45),
    ("cage06", "Gorila",      "Gorilla gorilla",          0.17, 0.28),
    ("cage07", "Flamingo",    "Phoenicopterus roseus",    0.83, 0.58),
]

def seed():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL;")
    cur = conn.cursor()
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
        print(f"  {cage_id}: {name} ({species})  pos=({lx}, {ly})")
    conn.commit()
    conn.close()
    print("Seed concluído.")

if __name__ == "__main__":
    if not os.path.exists(DB_PATH):
        print(f"Banco não encontrado em: {DB_PATH}", file=sys.stderr)
        print("Execute o backend ao menos uma vez para criar o banco.", file=sys.stderr)
        sys.exit(1)
    print(f"Atualizando banco: {DB_PATH}")
    seed()
