import sqlite3

conn = sqlite3.connect("cotisation.db")
cursor = conn.cursor()

cursor.execute("""
CREATE TABLE IF NOT EXISTS cotisations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL,
    montant INTEGER NOT NULL
)
""")

conn.commit()
conn.close()

print("✅ Table cotisations créée avec succès")
