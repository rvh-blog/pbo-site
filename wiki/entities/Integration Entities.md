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

## Discord Config

Tables:

- `discord_guilds`
- `discord_channels`

Discord channel rows map a Discord channel to a PBO division and feature toggles.

## See Also

- [[Sheets Sync Workflow]]
- [[Wiglett Workflow]]
- [[Discord Bot Workflow]]
