# Public Tools And Stats

Parent index: [[Home|PBO Site Wiki]]

This page covers public-facing tools and stats surfaces that are not owned by one league workflow.

## Matchup Prep

Matchup Prep lives at `/matchup-prep` and can be opened directly or from match pages with a `matchId` query param.

It is a planning surface that uses live league data and user preferences. Preferences are saved through `/api/preferences` with the page key `matchup-prep`.

The matchup speed calculator defaults both sides to level 50 for Season 11 and
later planning. Other speed calculator behavior remains unchanged.

Relevant files:

- `src/app/matchup-prep/page.tsx`
- `src/app/matchup-prep/matchup-prep-client.tsx`
- `src/app/api/preferences/route.ts`

## Draft Planner Preferences

The draft planner also uses `/api/preferences` with the page key `draft-planner`. Panel visibility and saved planning state should be treated as user-specific tool state, not league data.

See [[Draft Planner]].

## Leaderboards And Elo Tracker

Leaderboards live at `/leaderboards` and include coach/Pokemon ranking surfaces. Pokemon detail pages can link into the all-time Pokemon ranking source.

The Elo tracker lives at `/elo-tracker` and can be opened with coach-focused query params from coach profile pages.

Relevant files:

- `src/app/leaderboards/page.tsx`
- `src/app/leaderboards/leaderboards-client.tsx`
- `src/app/elo-tracker/page.tsx`
- `src/app/elo-tracker/elo-tracker-client.tsx`
- `src/lib/pokemon-leaderboard.ts`

## Pokemon And Coach Stats

Stats routes:

- `/pokemon/stats`
- `/pokemon/stats/fun-facts`
- `/pokemon/[id]`
- `/coaches/stats`
- `/coaches/[id]/pokemon-stats`

Current expectations:

- Pokemon detail pages show a clickable all-time ranking box beside K/D when the ranking is available.
- Season 10 Pokemon fun facts are tied to Season 10 and credit contributing coaches where the stat supports it.
- Season 10 coach fun facts are tied to Season 10.
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
