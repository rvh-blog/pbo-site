# Match Entities

## `matches`

Stores fixtures and results.

Important fields:

- `seasonId`
- `divisionId`
- `week`
- `coach1SeasonId`
- `coach2SeasonId`
- `winnerId`
- `coach1Differential`
- `coach2Differential`
- `isForfeit`
- `playedAt`
- `replayUrl`
- `scheduledAt`
- `startedAt`, `endedAt`
- `turnSnapshots`
- `keyEvents`
- `zoroarkInvolved`
- `isGameOfTheWeek`

`winnerId` must be one of the match's two season coaches, but this is not deeply DB-enforced.

## `match_pokemon`

Pokemon brought to a match.

Links:

- `matchId -> matches.id`
- `seasonCoachId -> season_coaches.id`
- `pokemonId -> pokemon.id`

Stores K/D and replay-derived damage/healing stats.

## `kill_events`

Normalized faint events derived from replay key events.

Links:

- Match.
- Victim Pokemon and victim season coach.
- Optional killer Pokemon and killer season coach.
- Optional move.

Kill events are supplementary. Match Pokemon K/D is the canonical table for most standings/leaderboard/betting settlement logic.

## `playoff_matches`

Bracket metadata. Playoff games can also have linked `matches` rows.

Week conventions in `matches`:

- `101`: Quarterfinals.
- `102`: Semifinals.
- `103`: Finals.

Do not double-count playoff games by treating `playoff_matches` and `matches` as separate result sources.

## Result Writes

The main write path is `src/app/api/matches/route.ts`.

See [[Match Results Workflow]] before changing it.

## See Also

- [[Match Results Workflow]]
- [[Replay Analysis Workflow]]
- [[Elo, Betting, And Pick-Em Entities]]
