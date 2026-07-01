# Core League Entities

This page explains the identity model that most bugs come from.

## `coaches`

Persistent person/account.

Use for:

- Global Elo.
- Auth and claimed accounts.
- Mod flag.
- Blog posting permission.
- PBO coin balance.
- Store purchases.
- Coach profile identity.

Code:

- `src/lib/schema.ts`
- `src/lib/session.ts`
- `src/lib/auth.ts`

## `users`

Spectator accounts for non-coach users, mainly pick-ems and betting.

`users` and `coaches` both have `pboCoin`, and many participation tables use nullable `coachId` / `userId` pairs.

## `seasons`

Owns divisions, matches, prices, playoff matches, and transactions.

Important flags:

- `isCurrent`
- `isPublic`
- `isSchedulePublic`

`/api/seasons` intends only one current season by unsetting others when one is marked current.

## `divisions`

Belongs to one season. Most competitive data is division-scoped.

Free agent pools are division-specific, not season-wide.

## `season_coaches`

Team identity in a division/season.

Use for:

- Rosters.
- Matches.
- Match Pokemon.
- Standings.
- Transactions.
- Bets and pick-em predicted winners.
- Kill/death bet team ownership.

Fields to know:

- `coachId`: persistent coach/person.
- `divisionId`: division/team belongs to.
- `teamName`, `teamAbbreviation`, `teamLogoUrl`: display and sheet matching.
- `isActive`, `replacedById`: replacement coach handling.
- `remainingBudget`: roster transaction budget.

## Invariant

Never substitute `coaches.id` for `season_coaches.id`.

If a page shows a person's career profile, you likely need `coaches.id`. If a page shows a team in a season, a matchup, a roster, or a standing row, you likely need `season_coaches.id`.

## See Also

- [[Data Model]]
- [[Roster And Transaction Entities]]
- [[Match Entities]]
