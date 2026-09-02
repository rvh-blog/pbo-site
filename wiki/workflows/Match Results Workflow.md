# Match Results Workflow

Match results are the highest-risk write path in the app.

## Entry Points

- Admin matches page: `src/app/admin/matches/page.tsx`
- Match API: `src/app/api/matches/route.ts`
- Discord match command: `src/bot/commands/match.ts`
- Bot match service: `src/bot/services/match-service.ts`
- Wiglett match result: `src/lib/wiglett-integration.ts`

## Schedule Upload

Regular-season schedules are uploaded from the Schedule tab on the admin matches page.

Current behavior:

- An admin must select a season and a specific division before uploading.
- The upload format is CSV with `week`, `team1`, and `team2` columns.
- The page shows a disabled Upload Schedule CSV control with instructions until a division is selected.
- Season 11+ validation expects 16 teams per division, 8 regular-season weeks, and 8 fixtures per week.

Schedules are division-scoped. Moving teams after schedule upload requires updating affected match rows, not just changing `season_coaches.divisionId`.

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

## Replay Review State

- `matches.needs_review` holds a game for administrator review.
- `matches.review_notes` records the exact replay, format, roster, result, or
  PBO kill-attribution reason.
- The admin match list and editor highlight held games in yellow.
- A historical replay import must preserve the official winner, differential,
  and per-Pokemon K/D when parser output conflicts with the recorded PBO ledger.
- The controlled Season 6 archive backfill is an explicit exception: it writes
  the current parser K/D and kill-event attribution, while preserving every
  historical conflict in the yellow review state. Do not apply that exception
  to ordinary historical edits without explicit approval.
- A missing replay link is reviewable only for a non-forfeit game. An official
  forfeit does not require a replay and must not be held solely because its
  replay link is empty.

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
