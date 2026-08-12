# Statistics Audit — August 11, 2026

This audit checks the live Fly production database read-only and reviews the
website code that derives public statistics. It covers Seasons 5 through 11.
No production data was changed.

The reusable read-only audit is `scripts/audit-stat-integrity.cjs`. Run it
locally with:

```powershell
node scripts/audit-stat-integrity.cjs pbo.db
```

The local `pbo.db` was last updated August 1 and does not contain Season 11
matches, so conclusions in this report use the live Fly volume audit rather
than the local database totals.

## Production Baseline

| Season | Scheduled | Results | Regular | Playoffs | Pokémon appearances | Team/Pokémon entries |
|---|---:|---:|---:|---:|---:|---:|
| 11 | 320 | 162 | 162 | 0 | 1,761 | 750 |
| 10 | 252 | 252 | 224 | 28 | 2,807 | 603 |
| 9 | 252 | 252 | 224 | 28 | 2,688 | 689 |
| 8 | 189 | 189 | 168 | 21 | 2,124 | 504 |
| 7 | 189 | 188 | 167 | 21 | 2,016 | 490 |
| 6 | 189 | 187 | 166 | 21 | 2,040 | 496 |
| 5 | 126 | 125 | 111 | 14 | 1,378 | 337 |

Season 11 is in progress. Its 158 unresolved schedule rows are not treated as
completed games. A result counts only when `winner_id` is one of the match's
two `season_coaches.id` participants.

## Verified

- Every valid result produces exactly one team win and one team loss.
- Pokémon appearance wins plus losses equal total appearances for every
  season. A team can have fewer appearance rows in forfeits or incomplete
  historical replay records, so Pokémon win and loss totals do not have to be
  equal to one another globally.
- No duplicate `(match, season team, Pokémon)` appearance rows exist in
  Seasons 5–11.
- No appearance is assigned to a team outside its match in Seasons 5–11.
- No negative kill/death, move-use, item, damage, healing, Fantasy, or roster
  values were found.
- All saved move/item JSON is valid.
- All tracked move-use counts are positive whole numbers.
- Held-item aggregation has no repeated held-item reveal groups after excluding
  Trick and Switcheroo transfers.
- Every result from Seasons 5–11 has exactly two Elo history rows.
- Playoff winners belong to their bracket matchup and division, and every
  linked playoff match exists.
- Rosters have no duplicate team/Pokémon rows and no negative stored prices.
- Season 6's eight asymmetric differentials are preserved as official
  season-specific results. Zero-sum differential was deliberately not imposed.

## Tracking Coverage

These fields cannot be compared across all seven seasons as if they had equal
coverage:

- Kills, deaths, match results, standings, playoffs, and Elo: Seasons 5–11.
- Revealed items: Seasons 5–11, but only when a saved replay explicitly reveals
  the held item. Unrevealed items are unknown.
- Move usage: Season 9 onward; Season 9 and current Season 11 are partial.
- Damage dealt/taken and HP recovered: Season 10 onward.
- Normalized kill events used by detailed fun facts: Seasons 10–11 only.
- Fantasy persisted weekly statistics: Season 11 only.

Revealed held-item uses after excluding transfers:

| Season | Held-item uses |
|---|---:|
| 11 | 747 |
| 10 | 1,101 |
| 9 | 148 |
| 8 | 91 |
| 7 | 113 |
| 6 | 77 |
| 5 | 62 |

These are observed appearances, not estimates of every item brought.

## Confirmed Code Defects Corrected Locally

- Comprehensive Pokémon records now show sortable Wins and Losses and count
  only valid completed results for their Overall, Regular Season, and Playoffs
  scopes.
- Regular-season PBO Best/Worst Differential no longer includes unfinished or
  forfeited schedule rows.
- Malformed historical winner IDs are excluded from Battle Record, the main
  coach leaderboard, the all-time Pokémon leaderboard, and standings instead
  of being converted into losses for the second participant.
- The all-time Pokémon leaderboard and coach-profile Pokémon totals no longer
  include orphaned `match_pokemon` rows.
- “Most Consecutive Seasons Played” now requires actual qualifying match
  participation instead of merely having a season-team record.
- Trick and Switcheroo transfers are now excluded consistently from Item Usage,
  Pokémon item trends, coach item tendencies, and Match Prep scouting.
- Fantasy weekly cached rows now self-refresh when persisted game totals do not
  match the completed match Pokémon rows. The live cache was missing 36
  appearances from three Season 11 matches; all existing cached rows matched
  the scoring formula and direct source values.

## Source-Data Exceptions

- There are 24 orphaned `match_pokemon` rows globally. The audited public
  aggregations now ignore them. This report does not delete them.
- There are 154 orphaned roster rows globally. Current roster/championship
  calculations join through valid season teams or winners, so these do not
  enter the audited totals. They remain production cleanup candidates.
- Season 7 match #1180 records Sableye with two deaths. This value is preserved
  exactly as stored; no rule assumption or production correction was made.
- Detailed kill events are not a complete substitute for `match_pokemon` kill
  totals. Seasons 5–9 have no normalized kill events, and Seasons 10–11 include
  unattributed or missing event-level kills. Fun-fact pages using kill events
  therefore describe the available event log rather than the canonical total
  kill ledger.

## Verification

- `npx tsc --noEmit`: passed.
- Targeted ESLint for the cleanly lintable changed statistics files: passed.
- Full `npm run build`: passed.
- Local smoke tests returned HTTP 200 for Comprehensive Leaderboard, Item
  Usage, Battle Record/PBO Records, PBO Stats, Pokémon Battle Stats, Elo
  Tracker, Coach Battle Stats, and the Standings API.
- The large legacy coach profile file still reports its pre-existing lint
  backlog when linted as a whole; the audit change did not introduce those
  diagnostics.

The fixes and this report are included in the August 11, 2026 statistics and
comparison release.
