#!/usr/bin/env bash
# A consistent copy of Hoorah's SQLite database (admins, Hoorah Pass codes, admin statistics), taken while the
# server runs (VACUUM INTO), gzipped into ~/hoorah-backups. Keeps the newest 14. Daily via cron: DEPLOY.md section 9.
# Copy the files somewhere off the VM now and then: a backup that only lives on the VM is lost with it.
set -euo pipefail
cd "$(dirname "$0")"

OUT="${HOORAH_BACKUP_DIR:-$HOME/hoorah-backups}"
KEEP="${HOORAH_BACKUP_KEEP:-14}"
STAMP="$(date +%F-%H%M)"
mkdir -p "$OUT"

docker compose exec -T server node --disable-warning=ExperimentalWarning -e "
  const fs = require('node:fs');
  const { DatabaseSync } = require('node:sqlite');
  fs.rmSync('/data/backup.db', { force: true });
  const db = new DatabaseSync('/data/hoorah.db');
  db.exec(\"VACUUM INTO '/data/backup.db'\");
  db.close();
"
docker compose cp server:/data/backup.db "$OUT/hoorah-$STAMP.db"
docker compose exec -T server node -e "require('node:fs').rmSync('/data/backup.db', { force: true })"
gzip -f "$OUT/hoorah-$STAMP.db"

ls -1t "$OUT"/hoorah-*.db.gz | tail -n +"$((KEEP + 1))" | xargs -r rm --
echo "Tersimpan: $OUT/hoorah-$STAMP.db.gz"
