# Elo Workflow

## Formula

```text
expectedScore = 1 / (1 + 3 ^ ((opponentElo - ownElo) / 400))
newElo = currentElo + 100 * (actualScore - expectedScore)
```

The rating is rounded to 2 decimals.

## Scores

- Normal win: `1`
- Normal loss: `0`
- Draw support: `0.5`
- Forfeit win: `0.75`
- Forfeit loss: `0.25`
- Double forfeit: both `0.25`

Forfeits enforce a minimum 15 point swing/loss.

## Files

- Formula: `src/lib/elo.ts`
- Update/recalc service: `src/lib/elo-service.ts`
- CLI recalc script: `src/lib/recalculate-elo.ts`
- API: `src/app/api/elo/route.ts`

## Data

- Current rating: `coaches.eloRating`
- Audit/history: `elo_history`

Elo uses persistent `coaches.id`, not `season_coaches.id`.

## Fast Path

If the match is the most recent completed match for both coaches, `updateEloForMatch()` processes only that match.

## Full Recalc

Historical edits return `needsFullRecalc`. Full recalc:

1. Loads all completed matches and double forfeits.
2. Sorts by season number, week, then match id.
3. Clears existing `elo_history`.
4. Rebuilds ratings chronologically.
5. Updates `coaches.eloRating`.

Run:

```bash
npm run elo:recalculate
```

## Risks

- Editing old matches without recalculation leaves later Elo stale.
- Coaches can have multiple `season_coaches` rows; Elo must follow persistent coach identity.
- Some historical edge cases are handled with explicit overrides in `src/lib/elo.ts`.

## See Also

- [[Elo, Betting, And Pick-Em Entities]]
- [[Match Results Workflow]]
