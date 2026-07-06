# Sheets Sync Workflow

Google Sheets sync mirrors PBO division data into configured spreadsheets.

## Files

- `src/lib/sheets-sync.ts`
- `src/lib/sheets-sync-all.ts`
- `src/lib/sheets-roster-sync.ts`
- `src/lib/sheets-match-stats-sync.ts`
- `src/lib/sheets-transaction-sync.ts`

## Admin

- Admin page: `src/app/admin/sheets/page.tsx`
- Config API: `src/app/api/admin/sheet-sync/route.ts`
- Trigger API: `src/app/api/admin/sheet-sync/trigger/route.ts`

## Data

`division_sheet_sync` stores:

- Division.
- Spreadsheet id.
- Master enable/disable.
- Match results enable/disable.
- Rosters/transactions enable/disable.
- Last status/error.

## Flow

`syncDivision(divisionId)`:

1. Loads division sync config.
2. Checks DB sync toggles.
3. Checks sheet-side `Config!B2`.
4. Builds Pokemon name mapping once.
5. Syncs rosters if enabled.
6. Syncs match stats if enabled.
7. Syncs transactions if enabled.
8. Updates sync status.

`syncAllDivisions()` only syncs configured divisions from current seasons.

## Risks

- Sheet layout is fragile.
- Team names and abbreviations are used for placement.
- Pokemon names depend on the sheet's Pokédex mapping.
- Season 11+ Pokemon lookup uses the central normalizer in `src/lib/pokemon-name-utils.ts`, including hyphenated and spaced aliases for form names such as Urshifu Single/Rapid Strike and Tornadus/Landorus/Thundurus/Enamorus Incarnate.
- Template changes can silently skip or misplace data.
- Roster sync uses time-synced roster logic.

## Checklist For Changes

- Test on a non-production spreadsheet.
- Verify sync toggles.
- Verify `Config!B2`.
- Check roster, transaction, and match result sections separately.
- Avoid extra API calls; prefer batched reads/writes.

## See Also

- [[Integration Entities]]
- [[Rosters And Transactions Workflow]]
- [[Production Safety Runbook]]
