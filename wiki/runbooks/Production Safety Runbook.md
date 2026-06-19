# Production Safety Runbook

## Never Do Casually

- Upload local `pbo.db` to production.
- Delete seasons/divisions/coaches.
- Edit old transactions.
- Edit historical match results.
- Change name normalization.
- Change sheet sync layout assumptions.
- Change match result cascade behavior.

## Before Production DB Work

1. Download a fresh DB copy.
2. Keep a timestamped backup.
3. Test locally.
4. Run integrity checks.
5. Choose a quiet window.
6. Communicate that writes should pause.

## Files Not To Commit

- `pbo.db`
- `pbo.db-wal`
- `pbo.db-shm`
- `backups/`
- secrets
- local env files
- generated `dist/` unless intentionally updating bot bundle

## Hidden Couplings

- Season/division deletes may leave orphaned logical dependencies.
- Match edits affect Elo, coins, bets, pick-ems, and GOTW.
- Transaction edits affect historical rosters and odds.
- Sheet sync depends on names and template layout.
- Replay parser changes affect admin, bot, Wiglett, and public analyzer.

## Secrets

Do not copy secrets into wiki pages. If an existing old doc contains a secret, do not propagate it.

## See Also

- [[Database Runbook]]
- [[Match Results Workflow]]
- [[Rosters And Transactions Workflow]]
- [[Sheets Sync Workflow]]
