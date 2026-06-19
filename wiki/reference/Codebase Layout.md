# Codebase Layout

Use this page when deciding where a change belongs.

## App Routes

- `src/app`: Next.js App Router pages and API routes.
- `src/app/admin`: admin UI.
- `src/app/api`: API routes.
- `src/app/seasons`, `src/app/coaches`, `src/app/matches`: public league pages.
- `src/app/analyzer`: public Showdown replay analyzer.
- `src/app/broadcast`: broadcast overlay pages.

## Shared Code

- `src/components`: reusable React components.
- `src/components/ui`: small UI primitives.
- `src/lib`: database, services, business logic, sync code, seed/import helpers.
- `src/hooks`: client hooks.

## Bot And Integrations

- `src/bot`: Discord bot source.
- `pbo-discord-worker`: Cloudflare wake worker.
- `src/app/api/integrations/wiglett`: Wiglett API routes.
- `src/lib/wiglett-integration.ts`: Wiglett business logic.

## Database

- `src/lib/schema.ts`: Drizzle schema and relations.
- `src/lib/db.ts`: database client and SQLite pragmas.
- `drizzle`: generated SQL migrations and snapshots.
- `migrations`: manual SQL migrations.
- `pbo.db`: local SQLite database. Do not commit.

## Scripts And Data

- `scripts`: imports, repair scripts, fetchers, bot build, operational helpers.
- `data`: source CSV/XLSX data and local analysis files.
- `commands`: saved operational command snippets.
- `backups`: local DB backups. Do not commit.

## See Also

- [[Feature Map]]
- [[Operations]]
- [[Change Guide]]
