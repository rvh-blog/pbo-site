# Rosters And Transactions Workflow

Rosters are current state. Transactions are history used to reconstruct previous states.

## Entry Points

- Admin rosters: `src/app/admin/rosters/page.tsx`
- Admin transactions: `src/app/admin/transactions/page.tsx`
- Transaction API: `src/app/api/transactions/route.ts`
- Transaction service: `src/lib/transaction-service.ts`
- Time-synced roster utility: `src/lib/roster-utils.ts`

## Current Roster

`rosters` represents the current owned Pokemon for each `season_coaches.id`.

Do not infer current roster only from transactions. Transactions are used to reverse future changes for historical views.

## Season Coach Removal And Division Moves

`season_coaches.id` is the team identity for one season/division. Removing or moving one row can affect many other tables.

Admin rosters supports guarded removal:

- Hard removal deletes roster rows and the `season_coaches` row only when no dependent season data references it.
- Removal is blocked when matches, playoff rows, match Pokemon, kill events, transactions, pick-ems, fantasy picks, bets, kill bets, death bets, or replacement links reference the team.
- The UI should surface the blocker list returned by the API instead of refreshing as if the delete succeeded.

Admin rosters also supports guarded division moves:

- Moves must stay inside the same season.
- Moves are blocked when matches or playoff rows already reference the team, because those rows are division-scoped.
- If a post-schedule move is needed, build an explicit migration tool that updates related match/division data intentionally.

## Historical Roster

Historical roster views use match week plus transaction history.

This affects:

- Matchup prep.
- Match previews.
- Kill/death bet odds.
- Sheet roster sync.
- Admin match replay roster matching.

## Transaction Types

- `FA_PICKUP`: adds a free agent.
- `FA_DROP`: drops to free agency.
- `FA_SWAP`: pickup and drop in one action.
- `P2P_TRADE`: trade between two season coaches.
- `TERA_SWAP`: add/remove/swap Tera captain status.

## Budget Rules

- `season_coaches.remainingBudget` is current budget.
- Roster `price` can include Tera captain cost.
- Transactions store signed `budgetChange`.
- Tera swaps may mutate roster price and budget.

## Risks

- Some transaction operations are multi-step without a DB transaction.
- Bulk roster editing can bypass transaction history.
- Editing old transactions changes reconstructed history.
- P2P trade partner perspective is inferred, not separately stored.
- `pokemonIn` / `pokemonOut` are JSON arrays and not FK-enforced.

## Checklist For Changes

- Test the primary team and partner team for P2P trades.
- Test undo if touching transaction execution.
- Test time-synced roster for a week before and after the transaction week.
- Check budget and Tera captain price behavior.
- Check sheet sync output if roster data shape changes.

## See Also

- [[Roster And Transaction Entities]]
- [[Sheets Sync Workflow]]
- [[Data Model]]
