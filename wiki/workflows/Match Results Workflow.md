# Match Results Workflow

Match results are the highest-risk write path in the app.

## Entry Points

- Admin matches page: `src/app/admin/matches/page.tsx`
- Match API: `src/app/api/matches/route.ts`
- Discord match command: `src/bot/commands/match.ts`
- Bot match service: `src/bot/services/match-service.ts`
- Wiglett match result: `src/lib/wiglett-integration.ts`

## Result Cascade

When a result is recorded, the app may update:

1. `matches`
2. `match_pokemon`
3. `kill_events`
4. `elo_history`
5. `coaches.eloRating`
6. `coaches.pboCoin` / `users.pboCoin`
7. `bets`
8. `kill_bets`
9. `death_bets`
10. `pick_em_rewards`

## Create Result

For a new result:

1. Match fields are set: winner, differentials, forfeit flag, replay/timing/event data.
2. Match Pokemon rows are inserted.
3. Kill events are derived from replay key events when available.
4. Elo is updated for the two persistent coaches.
5. Match coins are awarded.
6. Bets are resolved or refunded.
7. Pick-em and GOTW rewards are awarded.

## Edit Existing Result

For an existing result:

- Match Pokemon rows are deleted and reinserted when `pokemonData` is supplied.
- Kill events are deleted and reinserted when event data is supplied.
- Bets are re-resolved if the result or Pokemon data changes.
- Pick-em rewards are re-resolved if the winner changes.
- GOTW bonus is reversed and re-awarded when appropriate.
- Historical Elo edits may set `needsFullRecalc`.

## Forfeits

Single forfeit:

- Winner receives forfeit Elo score `0.75`.
- Loser receives forfeit Elo score `0.25`.
- Winner gets match coins; loser does not.
- Bets are refunded.

Current match participation reward:

- A player receives 10 PBO Coin for playing a game.

Double forfeit:

- `winnerId` is null and `isForfeit` is true.
- Both coaches receive Elo score `0.25`.

## Risks

- The cascade is not a single DB transaction.
- `winnerId` must be one of the match's two `season_coaches.id` values.
- Historical edits can leave later Elo stale until recalculation.
- Match delete removes bet rows after refunding pending bets; already-settled coin movement may require extra care.
- Kill/death betting settlement depends on accurate `match_pokemon`.

## Checklist For Changes

- Validate cross-entity consistency, not just ID presence.
- Test new result entry.
- Test editing an existing result.
- Test forfeit behavior.
- Test bet re-resolution if match Pokemon changes.
- Check `needsFullRecalc` handling.

## See Also

- [[Match Entities]]
- [[Elo, Betting, And Pick-Em Entities]]
- [[Replay Analysis Workflow]]
- [[Elo Workflow]]
