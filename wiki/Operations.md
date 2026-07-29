# Operations

Parent index: [[Home|PBO Site Wiki]]

Operational runbooks:

- [[Local Development Runbook]]
- [[GitHub Collaboration Runbook]]
- [[Deploy Runbook]]
- [[Database Runbook]]
- [[Migration Runbook]]
- [[Verification Runbook]]
- [[Production Safety Runbook]]

## Local Development

Install dependencies:

```bash
npm install
```

Run the app:

```bash
npm run dev
```

Persistent Turbopack filesystem caching is disabled in `next.config.ts`. Next
16.1 enables it by default, but on the OneDrive-backed Windows checkout its
`.next/dev/cache/turbopack` blob store grew beyond 200 GB. `.next` remains
generated and disposable; disabling the persistent cache trades some cold-start
speed for bounded local disk use.

Build and typecheck:

```bash
npm run build
npx tsc --noEmit
```

Targeted lint for changed files:

```bash
npx eslint src/path/to/file.ts src/path/to/file.tsx
```

The database path is selected in `src/lib/db.ts`:

- Production: `DATABASE_PATH`, set to `/data/pbo.db` in Fly.
- Local default: `pbo.db` in the repo root.

SQLite is initialized in WAL mode with read-heavy pragmas.

## Production Deployment

Production is the Fly.io app `pbo-site`.

For normal shared development, GitHub is the source of truth for code and Fly is only the runtime target. Read [[GitHub Collaboration Runbook]] before inviting collaborators or deploying shared work.

Config:

- `fly.toml`
- `Dockerfile`
- `scripts/start.sh`

Fly config highlights:

```text
app = "pbo-site"
primary_region = "iad"
DATABASE_PATH = "/data/pbo.db"
volume mount = pbo_data -> /data
internal_port = 3000
```

Deploy:

```bash
fly deploy
```

The Docker build:

1. Runs `npm ci`.
2. Runs `npm run build`.
3. Runs `node scripts/build-bot.js`.
4. Starts `/app/start.sh`.

`start.sh` starts the Discord bot only when `DISCORD_BOT_TOKEN` is set. Bot failure does not kill the web app. If Next.js exits, the container shuts down.

## Production Database

The production SQLite database lives on the Fly volume at:

```text
/data/pbo.db
```

Use the WAL-aware commands from `commands/terminal commands.txt`. The older `commands/terminal commands` does not download WAL/SHM files and should be treated as outdated.

### Download Production DB To Local

This backs up the current local `pbo.db`, removes local SQLite sidecar files, starts the Fly machine, and downloads `pbo.db`, `pbo.db-wal`, and `pbo.db-shm`.

```bash
mkdir -p backups && ([ -f pbo.db ] && cp pbo.db "backups/pbo.db.$(date +%Y%m%d_%H%M%S)" || true) && rm -f pbo.db pbo.db-wal pbo.db-shm && fly machine start $(fly machine list -q) && sleep 5 && echo -e "get /data/pbo.db pbo.db\nget /data/pbo.db-wal pbo.db-wal\nget /data/pbo.db-shm pbo.db-shm" | fly sftp shell && echo "Downloaded database with WAL files - will merge when opened locally"
```

After download, opening the DB locally will merge WAL state.

### Upload Local DB To Production

This is destructive to production. Use only after testing locally and keeping a backup.

```bash
sqlite3 pbo.db "PRAGMA wal_checkpoint(TRUNCATE);" && fly machine start $(fly machine list -q) && sleep 8 && fly ssh console -C "rm -f /data/pbo.db /data/pbo.db-shm /data/pbo.db-wal" && echo "put pbo.db /data/pbo.db" | fly sftp shell && fly ssh console -C "chown nextjs:nodejs /data/pbo.db" && fly apps restart
```

Do not upload a DB while admins or integrations are actively writing match results, transactions, or bets.

## Drizzle And Migrations

Config:

- `drizzle.config.ts`
- `src/lib/schema.ts`
- `drizzle`
- `migrations`

Commands:

```bash
npm run db:generate
npm run db:push
npm run db:seed
```

Underlying commands:

```bash
drizzle-kit generate
drizzle-kit push
npx tsx src/lib/seed.ts
```

Drizzle is configured against local `./pbo.db`. Production schema changes should be tested locally first, then applied as part of a controlled DB update/deploy flow.

Standalone SQL migration currently present:

```bash
sqlite3 pbo.db < migrations/add-division-sheet-sync.sql
```

## Elo Recalculation

Recalculate Elo from the command line:

```bash
npm run elo:recalculate
```

The relevant code is:

- `src/lib/elo.ts`
- `src/lib/elo-service.ts`
- `src/lib/recalculate-elo.ts`

Historical match edits can return `needsFullRecalc`; do not assume a single edited old match has fully updated all later coach Elo.

## Discord Bot

Commands:

```bash
npm run bot
npm run bot:build
npm run bot:deploy-commands
```

Current interaction safeguards and diagnostics:

- `/match` validates replay players and Week rosters, shows a Pokémon review,
  and requires confirmation before recording the result.
- `/standings`, `/items`, `/team`, `/player`, and `/matchup` work in any
  server channel. They let the user select a public season and division, then
  select **All Coaches** for division-wide results or one coach for a narrower
  result. `/team` uses the coach selection to open that season's team.
- `/standings` can also browse schedule weeks with Discord-local timestamps.
- `/schedule` can start in any server channel and lets the user select a
  current division, but the selected division must have **Schedule Active** on
  at least one configured channel. `/draft` and `/match` remain restricted to
  their configured, enabled channels.
- `/help` and `/status` work in any server channel without a division mapping.
- `/status` checks bot, website, and database health. `/status details:true`
  adds command-registration and recent audit diagnostics for members with
  **Manage Server** permission.

In production, `scripts/start.sh` supervises the Discord bot separately from
the Next.js server. Moderators can use **Admin → Discord → Restart Bot** to
terminate the current bot process; the supervisor starts a fresh process and
the website remains online. The action is recorded in the Admin Audit Log.
Local `npm run bot` processes are not supervised by the website and must still
be restarted from their terminal.

Global Discord command updates can take up to an hour. If
`DISCORD_DEV_GUILD_ID` is set, commands deploy to that guild immediately and
the deploy script clears the global command set so Discord does not show both a
global and guild copy of every command. Without that variable, the script
deploys globally and clears stale guild-scoped copies from every server the bot
has joined.

Wake command registration:

```bash
DISCORD_TOKEN=your_bot_token node scripts/register-wake-command.js
```

The Cloudflare wake worker is in `pbo-discord-worker/autumn-dew-15b9`.

Worker commands:

```bash
npm run dev
npm run deploy
npm run cf-typegen
npm run test
```

## Google Sheets Sync

Sheets sync code:

- `src/lib/sheets-sync.ts`
- `src/lib/sheets-sync-all.ts`
- `src/lib/sheets-roster-sync.ts`
- `src/lib/sheets-match-stats-sync.ts`
- `src/lib/sheets-transaction-sync.ts`

Admin routes:

- `/api/admin/sheet-sync`
- `/api/admin/sheet-sync/trigger`

Important constraints:

- Sync configuration is one row per division in `division_sheet_sync`.
- `syncAllDivisions()` only syncs divisions attached to current seasons.
- Sheet-side `Config!B2` must enable sync.
- Sheet layout is fragile. Template changes can break row/column placement.
- Team names, abbreviations, and Pokemon name mapping are used to locate data in sheets.

## Secrets

Do not commit secrets. If you see secrets in existing docs or local files, do not copy them into new docs. Use environment variables and platform secret stores.
