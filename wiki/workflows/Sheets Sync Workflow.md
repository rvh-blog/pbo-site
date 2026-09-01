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

For completed matches, match stats sync writes the official W/L into the
fixture result cells. This is authoritative when the website records a winner
with a `0` differential on both sides; the sheet's normal result formulas leave
both sides blank for `0-0` because they infer W/L from the differential. When
a result is cleared, sync restores the template formulas for that fixture.

`syncAllDivisions()` only syncs configured divisions from current seasons.

## Risks

- Sheet layout is fragile.
- Team names and abbreviations are used for placement.
- Pokemon names depend on the sheet's Pokédex mapping.
- Pokemon lookup must use `src/lib/pokemon-name-utils.ts`. If a sheet name is
  missing an alias, update the central normalizer/lookup helpers there rather
  than adding a sheet-specific alias function.
- Season 11+ lookup includes friendly Mega names and common form spellings, such
  as `Mega Staraptor` <-> `Staraptor-Mega` and Urshifu Single/Rapid Strike.
- Template changes can silently skip or misplace data.
- Result cells must preserve the official website winner for valid `0-0`
  results; differential-only W/L formulas cannot represent that case.
- Roster sync uses time-synced roster logic.
- Roster sync writes each team's Pokemon in descending price order. Ties fall
  back to draft order, then Pokemon name. The admin roster page uses the same
  ordering so the visible admin roster matches what sync writes to sheets.

## Checklist For Changes

- Test on a non-production spreadsheet.
- Verify sync toggles.
- Verify `Config!B2`.
- Check roster, transaction, and match result sections separately.
- Test a completed `0-0` match and confirm the selected winner remains visible
  as W/L in the sheet-driven schedule.
- Avoid extra API calls; prefer batched reads/writes.

## See Also

- [[Integration Entities]]
- [[Rosters And Transactions Workflow]]
- [[Production Safety Runbook]]
