# Public Tools And Stats

Parent index: [[Home|PBO Site Wiki]]

This page covers public-facing tools and stats surfaces that are not owned by one league workflow.

## Matchup Prep

Matchup Prep lives at `/matchup-prep` and can be opened directly or from match pages with a `matchId` query param.

It is a planning surface that uses live league data and user preferences. Preferences are saved through `/api/preferences` with the page key `matchup-prep`.

The matchup speed calculator defaults both sides to level 50 for Season 11 and
later planning. Other speed calculator behavior remains unchanged.

The page header links to the external Nimbasa City Post VGC Damage Calculator
and displays attribution beside the link. The external tool opens in a new tab.

Relevant files:

- `src/app/matchup-prep/page.tsx`
- `src/app/matchup-prep/matchup-prep-client.tsx`
- `src/app/api/preferences/route.ts`

## Draft Planner Preferences

The draft planner also uses `/api/preferences` with the page key `draft-planner`. Panel visibility and saved planning state should be treated as user-specific tool state, not league data.

See [[Draft Planner]].

## Leaderboards And Elo Tracker

Leaderboards live at `/leaderboards` and include coach/Pokemon ranking surfaces. Pokemon detail pages can link into the all-time Pokemon ranking source.

The Comprehensive Leaderboard lives at `/leaderboards/comprehensive`. It lets
visitors select any public season and ranks each team's Pokemon separately by
total kills across every visible division in that season. The current season is
selected by default, and an All Seasons option combines every public season.
Overall, regular-season, and playoff tabs use the standard PBO playoff week
boundary (`week > 100`). The Pokemon search filters the active tab by species
name while keeping each matching team's entry separate. Division, team, coach,
and minimum-games filters can be combined. The All Seasons table adds a Season
column so repeated team/Pokemon entries remain attributable to the correct year.
Kills per game is a sortable rate column. Summary cards identify the active
view's kill, differential, and kills-per-game leaders, and each Pokemon row can
expand into a game-by-game opponent, result, kill/death, and replay breakdown.

The Item Usage leaderboard lives at `/leaderboards/items`. It counts distinct
held items explicitly revealed for a Pokemon in one saved replay, supports
season and division filters, and summarizes the leading Pokemon and persistent
coaches for each item. Each item expands into a game-by-game source list with
the matchup, holder, reveal turn/event, match page, and replay link. Items
revealed only because the Pokemon received them through Trick or Switcheroo do
not count as that Pokemon's usage. Unrevealed starting items remain unknown.

Battle Record lives at `/battle-record` and is linked from the header beside
Leaderboards. It shows all-time coach scoreline records from completed
non-forfeit matches. Default sorting is descending games played, every column is
sortable, and the table supports a minimum-games filter.

The PBO Records section has Regular Season, Playoffs, and Overall scopes.
Overall recomputes each general record across regular-season and playoff matches
together; it is not a merge of the two separate top-three lists. The
playoff-specific consecutive-appearance category remains exclusive to the
Playoffs scope. Worst Differential appears in Regular Season and Overall but is
intentionally omitted from Playoffs.

Divisional Records provides the same three scopes for Infinity, Stargazer,
Sunset, Crystal, and Neon, using completed non-forfeit matches from Season 6
onward. Each division uses its official color. Divisional views intentionally
omit Most Championships, Highest Peak Elo, and Most Consecutive Seasons Played.
Record URLs preserve the tab, division, and scope so coach milestone titles can
link directly to the applicable record card set.

Move Usage covers completed non-forfeit matches from Season 9 onward. Each
Pokemon row has a lazy-loaded View Game Sources section with the matchup, coach,
per-game move counts, match page, and replay. Empty saved move maps remain in
the appearance count and are identified as having no recorded move commands.

Battle Record aggregates and coach milestone datasets use 60-second server
caches. Move-source rows load only when expanded and use both a 60-second data
cache and short edge caching. The supporting indexes are declared in the schema
and in `migrations/add-battle-record-performance-indexes.sql`.

Pokemon Battle Stats lives at `/pokemon/stats` and is linked from the
Leaderboards `More Stats` button. It provides Kills, Deaths, Damage Dealt,
Damage Taken, and HP Recovered leaderboards. Each category supports Total and
Per Game views where applicable, plus season, season-grouped division, and
minimum-games filters. Kill and death totals use all recorded Pokemon
appearances. Damage and recovery averages count only appearances with recorded
replay-derived damage data, preventing older rows without damage tracking from
diluting those averages.

Battle Record metrics:

- Average Differential Per Game: average match differential across all counted games.
- Average Win Difference: average positive differential in wins.
- Average Loss Difference: average negative differential in losses.
- Winning Percentage: wins divided by counted games.
- Close Game Win Percentage: win rate in games decided by 1 or 2.
- Big Win Percentage: 5-0 or 6-0 wins divided by counted games.
- Last 15: recent win/loss record and percentage across the coach's last 15 counted games.

Battle Record uses coach identity (`coaches.id`) for the row and maps historical
team rows through `season_coaches.id`. If a coach has no team logo available, it
falls back to the PBO logo.

Admins can manage display-only PBO record corrections from
`/admin/battle-records`. Overrides replace the displayed entries for one record
category and scope while the underlying automatic calculations continue to run.
Each override stores a correction reason, supports up to three ranked entries,
and can be disabled or deleted to restore the calculated result. Override writes
are recorded in the admin audit log.

The Elo tracker lives at `/elo-tracker` and can be opened with coach-focused query params from coach profile pages.

Relevant files:

- `src/app/leaderboards/page.tsx`
- `src/app/leaderboards/leaderboards-client.tsx`
- `src/app/leaderboards/comprehensive/page.tsx`
- `src/app/leaderboards/items/page.tsx`
- `src/app/leaderboards/items/item-usage-filters.tsx`
- `src/app/pokemon/stats/page.tsx`
- `src/app/pokemon/stats/pokemon-stats-client.tsx`
- `src/app/battle-record/page.tsx`
- `src/app/battle-record/battle-record-table.tsx`
- `src/app/battle-record/battle-record-tabs.tsx`
- `src/app/battle-record/pokemon-move-records.tsx`
- `src/app/api/battle-record/move-sources/route.ts`
- `src/lib/coach-milestones.ts`
- `src/app/admin/battle-records/page.tsx`
- `src/app/api/admin/battle-record-overrides/route.ts`
- `src/lib/battle-record-overrides.ts`
- `src/app/elo-tracker/page.tsx`
- `src/app/elo-tracker/elo-tracker-client.tsx`
- `src/lib/pokemon-leaderboard.ts`

## League Poll

The active league poll appears in the PBO home page Your League box and on coach
profile pages. Admins edit it from the admin home page.

Expected behavior:

- Coach users can vote once per active poll.
- Results display only after the current coach has voted.
- Users who have not voted see the prompt and options without result bars.
- Spectators/logged-out users cannot vote.
- Any user can hide the poll locally.

Relevant files:

- `src/components/poll-card.tsx`
- `src/lib/polls.ts`
- `src/app/api/poll/route.ts`
- `src/app/api/admin/poll/route.ts`

## Pokemon And Coach Stats

Stats routes:

- `/pokemon/stats`
- `/pokemon/stats/fun-facts`
- `/pokemon/[id]`
- `/coaches/stats`
- `/coaches/[id]/pokemon-stats`

Current expectations:

- Pokemon Battle Stats selects the database-marked current season on initial
  load. All Seasons remains available, and is the fallback when no season is
  marked current.
- Pokemon detail pages show a clickable all-time ranking box beside K/D when the ranking is available.
- Season 11 Pokemon fun facts are tied to Season 11 and credit contributing coaches where the stat supports it.
- Season 11 coach fun facts are tied to Season 11.
- Pokemon and coach fun facts should be mobile optimized and use larger readable text.
- Coach fun facts should not include The Finisher.
- Ride or Die should show the top 25 inside its section without forcing the page to grow.

Relevant files:

- `src/app/pokemon/[id]/page.tsx`
- `src/app/pokemon/stats/page.tsx`
- `src/app/pokemon/stats/pokemon-stats-client.tsx`
- `src/app/pokemon/stats/fun-facts/page.tsx`
- `src/app/coaches/stats/page.tsx`
- `src/app/coaches/[id]/pokemon-stats/page.tsx`

## Power Rankings

Power rankings live at `/power-rankings` with a slideshow mode at `/power-rankings/slideshow`.

All public seasons use the shared standings calculation so replacement coaches
and standings tiebreakers are handled consistently. Slideshow schedules display
full opponent team names rather than team abbreviations.

Ranking rows also show movement from the standings before the latest completed
week, differential, recent form, current streak, coach Elo, and the latest
opponent, result, and score.

Relevant files:

- `src/app/power-rankings/page.tsx`
- `src/app/power-rankings/power-rankings-client.tsx`
- `src/app/power-rankings/slideshow/page.tsx`
- `src/app/power-rankings/slideshow/slideshow-client.tsx`

## Broadcast Overlay

Broadcast tools live at `/broadcast`, `/broadcast/overlay`, and `/broadcast/overlay2`.

The overlay uses match data and Showdown battle rendering code for OBS/stream views. Search results include broadcast/overlay results for related queries.

Current overlay expectations:

- Both overlay versions should recognize the Season 11 Champions NatDex Draft
  battle format through the shared battle/replay data flow.
- Roster Pokemon should match battle state by direct normalized name, species,
  visible battle form, and compact Pokemon id so updated PokeAPI forms and Mega
  forms are recognized.
- Hyphenated Showdown sprite ids should be preserved where the sprite endpoint
  expects them.
- Both server-rendered overlay routes must load the shared custom Pokemon alias
  and collapse maps, attach alias-aware lookup keys to roster entries, and pass
  the serialized maps into the live Showdown client.
- Division accents come from `getDivisionColor()`, including Infinity color
  `#E2A3C7`.

Relevant files:

- `src/app/broadcast/page.tsx`
- `src/app/broadcast/overlay/page.tsx`
- `src/app/broadcast/overlay/overlay-client.tsx`
- `src/app/broadcast/overlay2/page.tsx`
- `src/app/broadcast/overlay2/overlay2-client.tsx`
- `src/app/api/broadcast/[matchId]/route.ts`
- `src/app/api/broadcast/matches/route.ts`
- `src/lib/damage-calc.ts`

## Search And Utility Routes

Public utility APIs include:

- `/api/search`
- `/api/export`
- `/api/health`
- `/api/showdown-auth`

Search respects public visibility rules such as the Infinity Division release gate.
