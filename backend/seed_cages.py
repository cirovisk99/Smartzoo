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
    ("cage01", "Leão",      "Panthera leo",           0.25, 0.55),
    ("cage02", "Elefante",  "Loxodonta africana",     0.70, 0.30),
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
