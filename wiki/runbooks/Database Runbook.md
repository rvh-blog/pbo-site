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
