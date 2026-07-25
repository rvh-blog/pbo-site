# Fantasy Feature Handoff

Parent index: [[Home|PBO Site Wiki]]

This note captures the current fantasy feature work so it can be resumed later.

## Current Scope

Fantasy is a signed-in account feature at `/fantasy`.

## Current Test Scenario

The current local test scenario is Season 10, scouting Week 8:

- URL: `/fantasy?seasonId=10&week=8`
- Treat Week 8 as not played yet, even though Week 8 result data exists locally.
- The scout ranks Pokemon using Season 10 performance through Week 7.
- Saved fantasy leaderboard results stay at 0 for Week 8 until weekly results are
  intentionally enabled for the Season 11 flow.
- This Season 10 setup is a dry run for Season 11 weekly fantasy.

Rules in the current implementation:

- Only public seasons with `season_number >= 10` are available.
- Coaches and spectator users can both play.
- One fantasy entry is saved per signed-in account per week.
- A fantasy roster has exactly 6 unique Pokemon.
- The roster budget is 90 points.
- Pokemon costs come from `season_pokemon_prices`.
- Complex banned/unavailable Pokemon (`price < 0`) cannot be selected.
- Roster slots are division-based:
  - Slot 1: Infinity Division when the selected season has Infinity; older seasons without Infinity treat this as Any Division.
  - Slot 2: Stargazer Division.
  - Slot 3: Sunset Division.
- Slot 4: Crystal Division.
- Slot 5: Neon Division.
- Slot 6: Any Division.
- The scout supports a `week` query param. Example: `/fantasy?seasonId=10&week=8`
  shows fantasy-picker performance through Week 7 and labels each Pokemon with
  the team it was on at the start of Week 8 in the relevant division.
- Season 10 defaults to scouting Week 8 so the picker treats Week 8 as unplayed
  and uses Week 7-and-earlier performance.
- Existing Season 10 test fantasy entries are backfilled to Week 8 by
  `migrations/add-fantasy-week-instances.sql`; they should not appear as Week 1
  leaderboard entries.
- The Any Division slot uses one available Pokemon instance from one team/division.
  It does not add the same Pokemon's scores across multiple divisions.
- Pokemon already selected in My Fantasy Roster are hidden from the available
  picker list until removed from their roster slot.
- Starting with the weekly Season 11 flow, a fantasy player cannot reuse the
  same Pokemon from the same team in a later week. The same Pokemon can still be
  used from a different team/division in another week.
- Saved picks lock individually once that Pokemon's weekly matchup has started.
  Other unlocked picks for the same weekly entry may still be editable until
  their own matchup starts.

## Scoring

The current scoring formula is:

```text
score = kills * 5
      - deaths * 1
      + 2 if the Pokemon's team won
      - 2 if the Pokemon's team lost
```

This is used by both the scouting table and saved fantasy entry leaderboard.
The fantasy roster picker uses the selected scouting week as a cutoff: Week N
uses Pokemon match performance from weeks before N.
Saved fantasy leaderboard results are scored from the selected fantasy week only.
For the Season 10 Week 8 test view, Week 8 result data is intentionally ignored
so saved rosters stay at 0 points until the Season 11 weekly flow is enabled.
My Fantasy Roster uses those same selected-week scores for each saved pick and
for the roster Score total. The available Pokemon picker remains a scouting
surface and continues to show performance from weeks before the selected week.

## Rewards

Weekly fantasy rewards are tracked in `fantasy_rewards` and paid in PBO Coin after all matches for an eligible fantasy week are complete.

Reward tiers:

- 1st: 250 PBO Coin
- 2nd: 125 PBO Coin
- 3rd: 75 PBO Coin

Ties split the combined prize pool for every prize place occupied by the tied
group. Shares are equal whole-coin amounts; an indivisible remainder is left
unawarded rather than using entry update time as a tiebreaker.

Reward resolution reverses existing rewards for the week before recalculating when needed. The reward code applies to Season 10 and later.
Removing a recorded result or deleting a scored match also reverses or
recalculates the affected week's Fantasy rewards, so stale PBO Coin awards do
not remain after result corrections.

Relevant files:

- `src/lib/fantasy-rewards.ts`
- `migrations/add-fantasy-rewards.sql`

## UI Behavior

- Clicking a My Fantasy Roster slot changes the available Pokemon list to that
  slot's division rule.
- The fantasy leaderboard has tabs for Overall and Weeks 1-8. Week tabs show
  that week's saved rosters and results; Overall sums each player's weekly
  fantasy scores.
- The leaderboard defaults to the current scouting week tab when that week is
  between Weeks 1-8.
- In Overall, the Pokemon icons shown for a player come from that player's most
  recent saved weekly roster.
- The picker list sorts highest-to-lowest by the score shown for the active slot.
- The Pokemon Board is split by Pokemon/team instance and has All plus division
  tabs. The tabs filter client-side without refreshing the page. The board no
  longer shows the Rostered column.
- Pokemon Board searches rank Pokemon-name matches ahead of rows that match only
  by team name. Team, division, and type searching remain available.
- The Pokemon Board has a Previously Selected tab beside the standard board
  tabs. Pokemon/team instances already used by the signed-in user in prior weeks
  are excluded from All and division tabs and appear only in Previously Selected.
- The Schedule section shows all games for the current scouting week and has
  client-side All plus division tabs formatted like the Pokemon Board tabs.
- Engagement/admin settings include Feature Settings toggles for Fantasy and Blog.
  When Fantasy is hidden, navigation and fantasy APIs/pages are unavailable.
- Slot 6 / Any Division uses the best single team/division instance for each
  Pokemon, not a cumulative total across divisions.
- Saved picks store the selected Pokemon and its start-week `season_coach_id` so
  prior-week usage is tracked by team instance, not species alone.
- Selected roster cards show Pokemon name, then team name, then a performance
  line containing the Pokemon's actual score for the selected fantasy week.
- The My Fantasy Roster Score total sums the six selected-week pick scores and
  refreshes after recorded match results update the fantasy weekly statistics.
- Available picker cards also show Pokemon name, then team name, then performance
  line based on pre-week scouting performance.
- The weekly game plan shows live/final points from entered match results. The
  picker uses prior-week scouting performance rather than displaying projected
  scores or win probabilities.
- Signed-in players receive a completed-week recap with placement, reward, best
  and worst picks, percentile beaten, rank movement, points left on the board,
  the highest-scoring legal roster under that player's reuse history, and a
  preview of the next available player pool.
- Fantasy leaderboard rows include weekly and season scoring, weeks entered,
  average score, rank movement, and expandable per-week roster history.
- Leaderboard week tabs come from the season schedule rather than a hardcoded
  Week 1-8 list.
- The signed-in player's leaderboard position is highlighted with the gap to
  the next rank, while prize positions receive a distinct border.
- Live scores and standings refresh every 30 seconds through a lightweight
  response. Polling pauses in background tabs, prevents overlapping requests,
  and preserves unsaved roster edits.
- Disabled roster saves list each blocking condition, and mobile roster editing
  includes a sticky slots/budget/save control.
- Week selectors and leaderboard tabs identify upcoming, in-progress, complete,
  and signed-in no-entry states. Selecting a completed week opens that week's
  recap.
- Expanded lineup picks explain their score from KOs, deaths, and team result.
- Participant names link to public season Fantasy profiles with weekly lineups,
  best and lowest weeks, average score, rewards, and top Pokemon.

## Performance

- Schedule weeks and statuses share one narrow query and a short server cache.
- Weekly score rows are loaded in batches through the invalidated Fantasy stats
  cache.
- Background score polling excludes recap optimization, authentication, reuse
  history, and full score breakdowns.
- The scouting board uses a dedicated reuse-history response.
- Overall lineup history is fetched only when a leaderboard entry is expanded;
  profiles request only the selected participant.
- Leaderboards render in batches of 25 entries, while Pokemon tables retain
  their existing incremental rendering.
- Fantasy-specific compound indexes are defined in
  `migrations/add-fantasy-performance-indexes.sql`.

## Files

Main page and client UI:

- `src/app/fantasy/page.tsx`
- `src/app/fantasy/fantasy-entry-client.tsx`
- `src/app/fantasy/pokemon-board-client.tsx`

API:

- `src/app/api/fantasy-entry/route.ts`

Schema and migration:

- `src/lib/schema.ts`
- `migrations/add-fantasy-entries.sql`
- `migrations/add-fantasy-performance-indexes.sql`

Navigation:

- `src/components/navigation.tsx`

Related hydration cleanup from the same work session:

- `src/app/layout.tsx`
- `src/app/page.tsx`

## Database Tables

`fantasy_entries`

- `id`
- `season_id`
- `coach_id`
- `user_id`
- `week`
- `display_name`
- `created_at`
- `updated_at`

`fantasy_entry_picks`

- `id`
- `entry_id`
- `pokemon_id`
- `season_coach_id`
- `slot`
- `created_at`

`fantasy_rewards`

- `id`
- `entry_id`
- `season_id`
- `week`
- `coach_id`
- `user_id`
- `amount`
- `reason`
- `created_at`

The local `pbo.db` was migrated during development with:

```bash
sqlite3 pbo.db ".read migrations/add-fantasy-entries.sql"
```

Existing databases that already have the first fantasy migration need:

```bash
sqlite3 pbo.db ".read migrations/add-fantasy-week-instances.sql"
```

Fantasy rewards require:

```bash
sqlite3 pbo.db ".read migrations/add-fantasy-rewards.sql"
```

## Verification Already Run

```bash
npx.cmd tsc --noEmit
npx.cmd eslint src/app/fantasy/page.tsx src/app/fantasy/fantasy-entry-client.tsx src/app/api/fantasy-entry/route.ts src/lib/schema.ts
```

Smoke checks passed locally:

```text
/fantasy                         200
/api/fantasy-entry?seasonId=10   200
POST while logged out            401
```

## Important Notes

- The fantasy feature uses `coaches.id` / `users.id` for account ownership.
- It does not use `season_coaches.id` for fantasy entry ownership.
- It does still use season-specific Pokemon prices and season match data.
- Fantasy roster edits are locked per selected Pokemon once that Pokemon's weekly
  matchup has started.
- The fantasy picker filters and scores by the active slot's division. Slot 1
  still falls back to Any Division on Season 10 because Infinity starts in S11.
- The fantasy picker list sorts by the score shown for the active slot's division.
- The saved fantasy leaderboard scores saved entries from the selected fantasy
  week only. Weekly rewards are tracked separately in `fantasy_rewards`.
- Season 11 fantasy is expected to use individual week performance windows.
