# Roster And Transaction Entities

## `pokemon`

Global Pokemon reference data.

Important fields:

- `name`: internal PokeAPI-style name.
- `displayName`: Showdown-style display name.
- `types`, `moves`, `abilities`, stats, sprites/artwork.

Name matching and normalization are central to replay parsing, sheets, imports, and roster matching.

## `season_pokemon_prices`

Season-specific Pokemon pricing and ban metadata.

Fields:

- `seasonId`
- `pokemonId`
- `price`
- `teraBanned`
- `teraCaptainCost`
- `complexBanReason`

`price = -1` means complex ban/unavailable for drafting logic.

## `rosters`

Current roster state for each season coach.

Fields:

- `seasonCoachId`
- `pokemonId`
- `price`
- `draftOrder`
- `isTeraCaptain`
- `acquiredWeek`
- `acquiredVia`
- `acquiredTransactionId`

Roster `price` can include Tera captain cost.

## `transactions`

Historical roster changes.

Types:

- `FA_PICKUP`
- `FA_DROP`
- `FA_SWAP`
- `P2P_TRADE`
- `TERA_SWAP`

Important:

- `pokemonIn` / `pokemonOut` are JSON arrays of `pokemon.id`.
- P2P trade uses one row from the primary team's perspective.
- Partner perspective is inferred by swapping in/out.
- Transaction history is used to reconstruct historical rosters.
- Editing old transactions can affect historical match prep, odds, and sheet sync.

## Code

- `src/lib/transaction-service.ts`
- `src/lib/roster-utils.ts`
- `src/app/admin/transactions/page.tsx`
- `src/app/admin/rosters/page.tsx`

## See Also

- [[Rosters And Transactions Workflow]]
- [[Core League Entities]]
- [[Sheets Sync Workflow]]
