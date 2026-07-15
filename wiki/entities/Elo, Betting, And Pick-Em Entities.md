# Elo, Betting, And Pick-Em Entities

## Elo

Tables:

- `coaches.eloRating`: current rating snapshot.
- `elo_history`: rating after each processed match.

Elo uses persistent `coaches.id`, not `season_coaches.id`.

See [[Elo Workflow]].

## Currency

Currency lives on:

- `coaches.pboCoin`
- `users.pboCoin`

Many settlement flows must handle either a coach account or spectator account.

Current behavior notes:

- Match participation rewards are 10 PBO Coin.
- New coaches start with 150 PBO Coin.
- Admin coin grants use a 10 to 500 amount range.

## Winner Bets

`bets` stores match winner bets.

Important fields:

- `coachId` or `userId`
- `matchId`
- `predictedWinnerId`
- `amount`
- `odds`
- `status`
- `payout`

Pending bets do not escrow coins. Settlement applies coin changes.

## Kill Bets

`kill_bets` stores over/under kill threshold bets for a Pokemon in a match.

Settlement depends on `match_pokemon.kills`.

## Death Bets

`death_bets` stores whether a Pokemon dies or survives.

Settlement depends on whether the Pokemon was brought and whether `match_pokemon.deaths > 0`.

Pokemon not brought is a losing state for both death bet types.

## Pick-Ems

Tables:

- `pick_em_participants`
- `pick_em_picks`
- `pick_em_rewards`

Rewards are explicitly tracked. Re-resolution reverses coins and deletes/recreates reward rows.

## Fantasy Rewards

`fantasy_rewards` tracks weekly fantasy placement payouts.

Current tiers:

- 1st: 250 PBO Coin
- 2nd: 125 PBO Coin
- 3rd: 75 PBO Coin

Fantasy reward resolution is tied to completed weekly match results for Season 10 and later.

## Code

- `src/lib/betting.ts`
- `src/lib/kill-betting.ts`
- `src/lib/death-betting.ts`
- `src/lib/bet-resolution.ts`
- `src/lib/pick-em-rewards.ts`

## See Also

- [[Match Results Workflow]]
- [[Elo Workflow]]
