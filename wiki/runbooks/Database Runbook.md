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
- Keep timestamped backups in `backups/`. The production backup command keeps
  the three newest verified `season11-backfill-*` directories and removes only
  older local copies after the new database file passes size verification.
- Set `BACKUP_RETENTION_COUNT` to a different positive count when a maintenance
  window needs a longer local recovery history. Backups outside the generated
  `season11-backfill-*` naming pattern are never pruned automatically.
- Do not commit DB files or backups.

## Season 11 Replay Backfill

The application deployment adds the favorable-event columns, but historical
rows are filled by an explicit maintenance run. The production image includes
these bundled commands:

```bash
fly ssh console -C "node /app/dist/maintenance/backup-production-db.mjs"
fly ssh console -C "env DATABASE_PATH=/data/pbo.db node /app/dist/maintenance/backfill-season11-hax.mjs"
fly ssh console -C "env DATABASE_PATH=/data/pbo.db node /app/dist/maintenance/backfill-mega-items.mjs --season=11"
```

The first command checkpoints WAL, creates a timestamped backup under
`/data/backups`, verifies the copied database, and prunes older generated local
backups according to the retention policy above. The latter two are dry-run
previews. Only after reviewing
their counts during a quiet window should they be rerun with the explicit
write flags and confirmation gate:

```bash
fly ssh console -C "env DATABASE_PATH=/data/pbo.db ALLOW_PRODUCTION_BACKFILL=1 BACKFILL_CONFIRM=SEASON11 BACKFILL_BACKUP_CONFIRMED=1 node /app/dist/maintenance/backfill-season11-hax.mjs --apply"
fly ssh console -C "env DATABASE_PATH=/data/pbo.db ALLOW_PRODUCTION_BACKFILL=1 BACKFILL_CONFIRM=SEASON11 BACKFILL_BACKUP_CONFIRMED=1 node /app/dist/maintenance/backfill-mega-items.mjs --season=11 --write"
```

The completed production run on 2026-09-12 used a fresh backup under
`/data/backups/season11-backfill-2026-09-12T22-32-33-242Z/`. It mapped 3,511
Pokémon rows across 293 replay matches and removed three stale guaranteed
flinch events. One legacy Season 11 Week 5 Grimmsnarl row had no replay
evidence and was left unchanged. Mega-item inference filled 354 rows and
flagged 34 matches with conflicting item evidence for review; one appearance
was excluded because its historical roster membership could not be confirmed.

These commands update only derived replay evidence and review flags. They do
not change match winners, standings, Elo, transactions, or the legacy
interpretation for Seasons 5–10 and Season 11 Weeks 1–5. They are intentionally
not invoked by `start.sh`, so a machine restart cannot repeat a historical
write unexpectedly.

Historical Seasons 5-10 use the Paldea Dex Draft ruleset with Tera enabled.
Their replay backfills may record Tera-related battle evidence, but Mega
Pokemon and Mega-item inference is reserved for Season 11 only.

## Neon Season 7 Replay Backfill

The Neon Season 7 maintenance command restores the supplied historical replay
URLs and updates replay-derived match Pokemon fields, move usage, revealed
items, Experimental Stats event context, normalized battle events, and
replay-linked kill events. It preserves official winners and differentials.

After deploying the code, use a quiet-window, backup-first run:

```bash
fly ssh console -C "node /app/dist/maintenance/backup-production-db.mjs"
fly ssh console -C "env DATABASE_PATH=/data/pbo.db REPLAY_SCRAPE_URL=http://127.0.0.1:3000/api/replay-scrape node /app/dist/maintenance/backfill-s7-neon-replays.mjs"
fly ssh console -C "env DATABASE_PATH=/data/pbo.db ALLOW_PRODUCTION_BACKFILL=1 BACKFILL_CONFIRM=NEON_S7 BACKFILL_BACKUP_CONFIRMED=1 REPLAY_SCRAPE_URL=http://127.0.0.1:3000/api/replay-scrape node /app/dist/maintenance/backfill-s7-neon-replays.mjs --apply"
```

The dry run should be reviewed before the explicit apply command. The command
flags Ubers-format evidence, known aliases/spelling differences, Illusion
attribution, parser conflicts, missing replay evidence, and the historical
force-win records through `matches.needs_review` and `matches.review_notes`.

## Sunset Season 7 Replay Backfill

The application deployment includes the guarded Sunset S7 replay command. It
restores the supplied historical replay URLs and updates replay-derived match
Pokemon fields, move usage, revealed items, Experimental Stats event context,
normalized battle events, and replay-linked kill events. It preserves official
winners and differentials.

After deploying the code, use a quiet-window, backup-first run:

```bash
fly ssh console -C "node /app/dist/maintenance/backup-production-db.mjs"
fly ssh console -C "env DATABASE_PATH=/data/pbo.db REPLAY_SCRAPE_URL=http://127.0.0.1:3000/api/replay-scrape node /app/dist/maintenance/backfill-s7-sunset-replays.mjs"
fly ssh console -C "env DATABASE_PATH=/data/pbo.db ALLOW_PRODUCTION_BACKFILL=1 BACKFILL_CONFIRM=SUNSET_S7 BACKFILL_BACKUP_CONFIRMED=1 REPLAY_SCRAPE_URL=http://127.0.0.1:3000/api/replay-scrape node /app/dist/maintenance/backfill-s7-sunset-replays.mjs --apply"
```

The dry run should be reviewed before the explicit apply command. The command
flags the Balanced Hackmons evidence, historical player aliases, parser
conflicts, and Sunset S7 force-win records through `matches.needs_review` and
`matches.review_notes`.

## Stargazer Season 7 Replay Backfill

The application deployment includes the guarded Stargazer S7 replay command. It
restores the supplied historical replay URLs and updates replay-derived match
Pokemon fields, move usage, revealed items, Experimental Stats event context,
normalized battle events, and replay-linked kill events. It preserves official
winners and differentials.

After deploying the code, use a quiet-window, backup-first run:

```bash
fly ssh console -C "node /app/dist/maintenance/backup-production-db.mjs"
fly ssh console -C "env DATABASE_PATH=/data/pbo.db REPLAY_SCRAPE_URL=http://127.0.0.1:3000/api/replay-scrape node /app/dist/maintenance/backfill-s7-stargazer-replays.mjs"
fly ssh console -C "env DATABASE_PATH=/data/pbo.db ALLOW_PRODUCTION_BACKFILL=1 BACKFILL_CONFIRM=STARGAZER_S7 BACKFILL_BACKUP_CONFIRMED=1 REPLAY_SCRAPE_URL=http://127.0.0.1:3000/api/replay-scrape node /app/dist/maintenance/backfill-s7-stargazer-replays.mjs --apply"
```

The dry run should be reviewed before the explicit apply command. The command
flags historical player aliases, parser conflicts, Illusion attribution, and
Stargazer S7 force-win records through `matches.needs_review` and
`matches.review_notes`.

## Neon Season 8 Replay Backfill

The application deployment includes the guarded Neon S8 replay command. It
restores the supplied historical replay URLs and updates replay-derived match
Pokemon fields, move usage, revealed items, Experimental Stats event context,
normalized battle events, and replay-linked kill events. It preserves official
winners and differentials.

After deploying the code, use a quiet-window, backup-first run:

```bash
fly ssh console -C "node /app/dist/maintenance/backup-production-db.mjs"
fly ssh console -C "env DATABASE_PATH=/data/pbo.db REPLAY_SCRAPE_URL=http://127.0.0.1:3000/api/replay-scrape node /app/dist/maintenance/backfill-s8-neon-replays.mjs"
fly ssh console -C "env DATABASE_PATH=/data/pbo.db ALLOW_PRODUCTION_BACKFILL=1 BACKFILL_CONFIRM=NEON_S8 BACKFILL_BACKUP_CONFIRMED=1 REPLAY_SCRAPE_URL=http://127.0.0.1:3000/api/replay-scrape node /app/dist/maintenance/backfill-s8-neon-replays.mjs --apply"
```

The dry run should be reviewed before the explicit apply command. The command
flags the Custom Game and Balanced Hackmons evidence, historical player aliases,
parser conflicts, Illusion attribution, missing replay evidence, and Neon S8
force-win records through `matches.needs_review` and `matches.review_notes`.

## Sunset Season 8 Replay Backfill

The application deployment includes the guarded Sunset S8 replay command. It
restores the supplied historical replay URLs and updates replay-derived match
Pokemon fields, move usage, revealed items, Experimental Stats event context,
normalized battle events, and replay-linked kill events. It preserves official
winners and differentials. Sunset S8 uses the Seasons 5-10 Paldea Dex Draft
ruleset with Tera enabled. Do not infer or backfill Mega Pokemon or Mega items
for it.

After deploying the code, use a quiet-window, backup-first run:

```bash
fly ssh console -C "node /app/dist/maintenance/backup-production-db.mjs"
fly ssh console -C "env DATABASE_PATH=/data/pbo.db REPLAY_SCRAPE_URL=http://127.0.0.1:3000/api/replay-scrape node /app/dist/maintenance/backfill-s8-sunset-replays.mjs"
fly ssh console -C "env DATABASE_PATH=/data/pbo.db ALLOW_PRODUCTION_BACKFILL=1 BACKFILL_CONFIRM=SUNSET_S8 BACKFILL_BACKUP_CONFIRMED=1 REPLAY_SCRAPE_URL=http://127.0.0.1:3000/api/replay-scrape node /app/dist/maintenance/backfill-s8-sunset-replays.mjs --apply"
```

The dry run should be reviewed before the explicit apply command. The command
flags historical source-name aliases, parser conflicts, missing replay
evidence, force-win records, and any roster or differential mismatches through
`matches.needs_review` and `matches.review_notes`.

## Stargazer Season 8 Replay Backfill

The application deployment includes the guarded Stargazer S8 replay command.
It restores the supplied historical replay URLs and updates replay-derived
match Pokemon fields, move usage, revealed items, Experimental Stats event
context, normalized battle events, and replay-linked kill events. It preserves
official winners and differentials. Stargazer S8 uses the Seasons 5-10 Paldea
Dex Draft ruleset with Tera enabled. Do not infer or backfill Mega Pokemon or
Mega items for it.

After deploying the code, use a quiet-window, backup-first run:

```bash
fly ssh console -C "node /app/dist/maintenance/backup-production-db.mjs"
fly ssh console -C "env DATABASE_PATH=/data/pbo.db REPLAY_SCRAPE_URL=http://127.0.0.1:3000/api/replay-scrape node /app/dist/maintenance/backfill-s8-stargazer-replays.mjs"
fly ssh console -C "env DATABASE_PATH=/data/pbo.db ALLOW_PRODUCTION_BACKFILL=1 BACKFILL_CONFIRM=STARGAZER_S8 BACKFILL_BACKUP_CONFIRMED=1 REPLAY_SCRAPE_URL=http://127.0.0.1:3000/api/replay-scrape node /app/dist/maintenance/backfill-s8-stargazer-replays.mjs --apply"
```

The dry run should be reviewed before the explicit apply command. The command
flags historical source-name aliases, manually reconciled week assignments,
parser conflicts, missing replay evidence, force-win records, and any roster
or differential mismatches through `matches.needs_review` and
`matches.review_notes`.

## Crystal Season 9 Replay Backfill

The application deployment includes the guarded Crystal S9 replay command. It
restores the supplied regular-season and playoff replay URLs and updates
replay-derived match Pokemon fields, move usage, revealed items, Experimental
Stats event context, normalized battle events, and replay-linked kill events.
It preserves official winners and differentials. Crystal S9 uses the Paldea
Dex Draft ruleset with Tera enabled and no Mega Pokemon or Mega items.

After deploying the code, use a quiet-window, backup-first run:

```bash
fly ssh console -C "node /app/dist/maintenance/backup-production-db.mjs"
fly ssh console -C "env DATABASE_PATH=/data/pbo.db REPLAY_SCRAPE_URL=http://127.0.0.1:3000/api/replay-scrape node /app/dist/maintenance/backfill-s9-crystal-replays.mjs"
fly ssh console -C "env DATABASE_PATH=/data/pbo.db ALLOW_PRODUCTION_BACKFILL=1 BACKFILL_CONFIRM=CRYSTAL_S9 BACKFILL_BACKUP_CONFIRMED=1 REPLAY_SCRAPE_URL=http://127.0.0.1:3000/api/replay-scrape node /app/dist/maintenance/backfill-s9-crystal-replays.mjs --apply"
```

The dry run should be reviewed before the explicit apply command. The command
flags parser K/D or differential conflicts, incomplete roster mappings, and
missing replay evidence through `matches.needs_review` and
`matches.review_notes`.

## Inspect Local DB

Examples:

```bash
sqlite3 pbo.db ".tables"
sqlite3 pbo.db "PRAGMA integrity_check;"
sqlite3 pbo.db "SELECT COUNT(*) FROM matches;"
```

## Sunset Season 9 Replay Backfill

The application deployment includes the guarded Sunset S9 replay command. It
restores the supplied regular-season and playoff replay URLs and updates
replay-derived match Pokemon fields, move usage, revealed items, Experimental
Stats event context, normalized battle events, and replay-linked kill events.
It preserves official winners, differentials, and the recorded PBO K/D ledger
when replay evidence conflicts. Sunset S9 uses the Paldea Dex Draft ruleset
with Tera enabled and no Mega Pokemon or Mega items.

After deploying the code, use a quiet-window, backup-first run:

```bash
fly ssh console -C "node /app/dist/maintenance/backup-production-db.mjs"
fly ssh console -C "env DATABASE_PATH=/data/pbo.db REPLAY_SCRAPE_URL=http://127.0.0.1:3000/api/replay-scrape node /app/dist/maintenance/backfill-s9-sunset-replays.mjs"
fly ssh console -C "env DATABASE_PATH=/data/pbo.db ALLOW_PRODUCTION_BACKFILL=1 BACKFILL_CONFIRM=SUNSET_S9 BACKFILL_BACKUP_CONFIRMED=1 REPLAY_SCRAPE_URL=http://127.0.0.1:3000/api/replay-scrape node /app/dist/maintenance/backfill-s9-sunset-replays.mjs --apply"
```

The dry run should be reviewed before the explicit apply command. The command
flags parser K/D or differential conflicts, incomplete roster mappings, source
alias/replacement context, Illusion attribution, and other replay conflicts
through `matches.needs_review` and `matches.review_notes`. Replay-derived rows
are still stored on reviewed matches so the public Experimental Stats, Move
Usage, and Item Usage pages retain the available evidence.

## Stargazer Season 9 Replay Backfill

The application deployment includes the guarded Stargazer S9 replay command. It
restores the supplied regular-season and playoff replay URLs and updates
replay-derived match Pokemon fields, move usage, revealed items, Experimental
Stats event context, normalized battle events, and replay-linked kill events.
It preserves official winners, differentials, and the recorded PBO K/D ledger
when replay evidence conflicts. Stargazer S9 uses the Paldea Dex Draft ruleset
with Tera enabled and no Mega Pokemon or Mega items.

After deploying the code, use a quiet-window, backup-first run:

```bash
fly ssh console -C "node /app/dist/maintenance/backup-production-db.mjs"
fly ssh console -C "env DATABASE_PATH=/data/pbo.db REPLAY_SCRAPE_URL=http://127.0.0.1:3000/api/replay-scrape node /app/dist/maintenance/backfill-s9-stargazer-replays.mjs"
fly ssh console -C "env DATABASE_PATH=/data/pbo.db ALLOW_PRODUCTION_BACKFILL=1 BACKFILL_CONFIRM=STARGAZER_S9 BACKFILL_BACKUP_CONFIRMED=1 REPLAY_SCRAPE_URL=http://127.0.0.1:3000/api/replay-scrape node /app/dist/maintenance/backfill-s9-stargazer-replays.mjs --apply"
```

The dry run should be reviewed before the explicit apply command. The command
flags parser K/D or differential conflicts, incomplete roster mappings, source
alias/replacement context, Illusion attribution, and missing replay evidence
through `matches.needs_review` and `matches.review_notes`. Replay-derived rows
are still stored on reviewed matches so the public Experimental Stats, Move
Usage, and Item Usage pages retain the available evidence.

## Season 10 Replay Backfill Fix

Season 10 replay URLs are already attached to the canonical match rows. The
guarded S10 command discovers those URLs and carries each canonical match id
through the shared importer, restoring Experimental Stats fields, normalized
battle events, replay-linked kill events, move usage, and item evidence without
changing official winners, differentials, or the recorded PBO K/D ledger. Set
`BACKFILL_DIVISION` to one of `stargazer`, `sunset`, `crystal`, or `neon` and run
each division separately.

After deploying the code, use a quiet-window, backup-first run:

```bash
fly ssh console -C "node /app/dist/maintenance/backup-production-db.mjs"
fly ssh console -C "env DATABASE_PATH=/data/pbo.db BACKFILL_SEASON=10 BACKFILL_DIVISION=stargazer REPLAY_SCRAPE_URL=http://127.0.0.1:3000/api/replay-scrape node /app/dist/maintenance/backfill-s10-replays.mjs"
fly ssh console -C "env DATABASE_PATH=/data/pbo.db BACKFILL_SEASON=10 BACKFILL_DIVISION=stargazer ALLOW_PRODUCTION_BACKFILL=1 BACKFILL_CONFIRM=STARGAZER_S10 BACKFILL_BACKUP_CONFIRMED=1 REPLAY_SCRAPE_URL=http://127.0.0.1:3000/api/replay-scrape node /app/dist/maintenance/backfill-s10-replays.mjs --apply"
```

Repeat the dry-run/apply pair with `sunset`/`SUNSET_S10`, `crystal`/
`CRYSTAL_S10`, and `neon`/`NEON_S10`. Review each dry-run before applying it.
The importer stores replay-derived rows even when a conflict requires review;
the existing review flags make parser conflicts, incomplete mappings, official
stat disagreements, and missing replay evidence visible for manual follow-up.

## See Also

- [[Production Safety Runbook]]
- [[Migration Runbook]]
- [[Operations]]
