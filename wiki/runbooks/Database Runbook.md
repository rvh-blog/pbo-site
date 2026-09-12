# Database Runbook

Production SQLite lives on the Fly volume at:

```text
/data/pbo.db
```

Local SQLite defaults to:

```text
pbo.db
```

Use the WAL-aware commands from `commands/terminal commands.txt`.

## Download Production DB

This backs up local `pbo.db`, removes local sidecars, starts the Fly machine, and downloads DB + WAL/SHM.

```bash
mkdir -p backups && ([ -f pbo.db ] && cp pbo.db "backups/pbo.db.$(date +%Y%m%d_%H%M%S)" || true) && rm -f pbo.db pbo.db-wal pbo.db-shm && fly machine start $(fly machine list -q) && sleep 5 && echo -e "get /data/pbo.db pbo.db\nget /data/pbo.db-wal pbo.db-wal\nget /data/pbo.db-shm pbo.db-shm" | fly sftp shell && echo "Downloaded database with WAL files - will merge when opened locally"
```

## Upload Local DB To Production

Destructive. Use only after local testing and backup.

```bash
sqlite3 pbo.db "PRAGMA wal_checkpoint(TRUNCATE);" && fly machine start $(fly machine list -q) && sleep 8 && fly ssh console -C "rm -f /data/pbo.db /data/pbo.db-shm /data/pbo.db-wal" && echo "put pbo.db /data/pbo.db" | fly sftp shell && fly ssh console -C "chown nextjs:nodejs /data/pbo.db" && fly apps restart
```

## Safety Notes

- Always download `pbo.db`, `pbo.db-wal`, and `pbo.db-shm`.
- Always checkpoint WAL before upload.
- Upload removes remote DB files before upload.
- Do not upload while admins or integrations may be writing.
- Keep timestamped backups in `backups/`.
- Do not commit DB files or backups.

## Season 11 Replay Backfill

The application deployment adds the favorable-event columns, but historical
rows are filled by an explicit maintenance run. The production image includes
these bundled commands:

```bash
fly ssh console -C "node /app/dist/maintenance/backup-production-db.mjs"
fly ssh console -C "DATABASE_PATH=/data/pbo.db node /app/dist/maintenance/backfill-season11-hax.mjs"
fly ssh console -C "DATABASE_PATH=/data/pbo.db node /app/dist/maintenance/backfill-mega-items.mjs --season=11"
```

The first command checkpoints WAL and creates a timestamped backup under
`/data/backups`. The latter two are dry-run previews. Only after reviewing
their counts during a quiet window should they be rerun with the explicit
write flags and confirmation gate:

```bash
fly ssh console -C "DATABASE_PATH=/data/pbo.db ALLOW_PRODUCTION_BACKFILL=1 BACKFILL_CONFIRM=SEASON11 BACKFILL_BACKUP_CONFIRMED=1 node /app/dist/maintenance/backfill-season11-hax.mjs --apply"
fly ssh console -C "DATABASE_PATH=/data/pbo.db ALLOW_PRODUCTION_BACKFILL=1 BACKFILL_CONFIRM=SEASON11 BACKFILL_BACKUP_CONFIRMED=1 node /app/dist/maintenance/backfill-mega-items.mjs --season=11 --write"
```

These commands update only derived replay evidence and review flags. They do
not change match winners, standings, Elo, transactions, or the legacy
interpretation for Seasons 5–10 and Season 11 Weeks 1–5. They are intentionally
not invoked by `start.sh`, so a machine restart cannot repeat a historical
write unexpectedly.

## Inspect Local DB

Examples:

```bash
sqlite3 pbo.db ".tables"
sqlite3 pbo.db "PRAGMA integrity_check;"
sqlite3 pbo.db "SELECT COUNT(*) FROM matches;"
```

## See Also

- [[Production Safety Runbook]]
- [[Migration Runbook]]
- [[Operations]]
