#!/usr/bin/env bash
# Run from project root: ./story-12-agent/migrate.sh
set -euo pipefail
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

echo -e "${YELLOW}▶ Running Story 12 Prisma migration${NC}"
cd packages/db
npx prisma migrate dev --name add_agent_fields --skip-generate \
  && echo -e "${GREEN}  ✓ Migration applied${NC}" \
  || {
    echo "  Prisma migration failed — applying SQL directly"
    python3 - << 'PY'
import sqlite3, shutil, os, glob

# Find the SQLite db
candidates = ['prisma/dev.db', 'dev.db', '../dev.db']
dbpath = next((p for p in candidates if os.path.exists(p)), None)
if not dbpath:
    print("ERROR: Could not find dev.db"); exit(1)

tmp = '/tmp/ava_migrate.db'
shutil.copy2(dbpath, tmp)
db = sqlite3.connect(tmp)
cur = db.cursor()
cur.execute('PRAGMA table_info(Intervention)')
existing = {row[1] for row in cur.fetchall()}

fields = [
    ("intentRaw", "TEXT"), ("intentAction", "TEXT"),
    ("intentCategory", "TEXT"), ("intentAttributes", "TEXT"),
    ("productsShown", "TEXT"), ("turnIndex", "INTEGER"), ("latencyMs", "INTEGER"),
]
added = []
for col, typ in fields:
    if col not in existing:
        cur.execute(f'ALTER TABLE "Intervention" ADD COLUMN "{col}" {typ}')
        added.append(col)

db.commit(); db.close()
shutil.copy2(tmp, dbpath)
os.remove(tmp)
print(f"  Added columns: {added if added else 'all already present'}")
PY
  }
