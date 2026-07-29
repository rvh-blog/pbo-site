# Integration Entities

## `division_sheet_sync`

One row per division for Google Sheets export/sync.

Fields:

- `divisionId`
- `spreadsheetId`
- `syncEnabled`
- `syncMatchResultsEnabled`
- `syncRostersTransactionsEnabled`
- `lastSyncAt`
- `lastSyncStatus`
- `lastSyncError`

`syncAllDivisions()` only syncs configured divisions attached to current seasons.

## `wiglett_events`

Audit/idempotency table for Wiglett events.

Fields:

- `eventId`: unique idempotency key.
- `eventType`.
- `divisionId`.
- `status`.
- `payload`.
- `result`.
- `error`.
- `receivedAt`, `processedAt`.

Reusing a successful `eventId` returns the stored result instead of processing again.

Wiglett match-result processing shares the replay parser with admin and bot
match recording. Pokemon from replay data are matched to rosters by exact lookup
first and normalized lookup second so Season 11 Mega forms and updated PokeAPI
names can resolve without changing Wiglett payload shape.

## Discord Config

Tables:

- `discord_guilds`
- `discord_channels`
- `discord_user_preferences`
- `discord_audit_logs`

Discord channel rows map a Discord channel to a PBO division and feature toggles.
User preferences store an IANA timezone by Discord user ID without requiring a
PBO account link. Audit rows record bot write attempts with operation IDs,
actors, entities, outcomes, and before/after values.

## See Also

- [[Sheets Sync Workflow]]
- [[Wiglett Workflow]]
- [[Discord Bot Workflow]]
