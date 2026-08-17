# Experimental Stats Development Handoff — August 15, 2026

Parent index: [[Home|PBO Site Wiki]]

This note preserves the local, unreleased Experimental Stats work completed on
August 15, 2026 so a future development session can resume without recreating
the design or data decisions.

## Release State

- The work is saved in the local working tree.
- It has not been committed, pushed, deployed, or released.
- Production data and the production website were not changed.
- The local development server was running from this repository on port 3000.
- Demo preview: `/experimental-stats/pokemon?demo=1`

## User-Facing Structure

Experimental Stats is available under the PBO Stats navigation and has a hub
at `/experimental-stats` plus focused child routes for Pokémon Profiles, Coach
Profiles, Compare, Rolling Trends, Custom Leaderboards, Replay Search, Battle
Visualizer, Rare Event Explorer, and Metric Glossary.

Every report shares URL-backed filters for season, division, week range,
coach, Pokémon, move, item, minimum appearances, result, competition stage,
and forfeits. When one Pokémon is selected, its move filter contains only
moves explicitly recorded for that Pokémon in the active data.

## Pokémon Reference Report

The Pokémon report includes:

- Standard and Advanced tabs.
- Season-and-coach career tables with career totals.
- Match-by-match game logs with opponent, result, K-D, damage, healing, turns,
  moves, item evidence, match links, and replay links.
- Splits for regular season/playoffs, wins/losses, schedule windows, coach,
  season, division, revealed item, and recorded move.
- Active-scope historical rankings.
- Single-game and career records.
- Descriptive Similar Pokémon scores using normalized recorded rates.
- Coverage-qualified percentile strips.

The visual design uses a stronger profile hero, segmented report tabs,
content-height metric cards, clearer result badges, improved spacing, and
mobile card alternatives for wide tables. Percentile 100 means the best
recorded value among qualified Pokémon in the active filter scope; it is not a
theoretical maximum, and ties can share it.

## Other Reports

- Coach Profiles include season-by-season franchise summaries, record,
  Pokémon usage, average battle length, damage/healing, setup, and held-item
  distributions.
- Replay Finder combines shared filters with text search, minimum damage,
  minimum kills, and survived-battle conditions.
- Battle Visualizer includes a compact two-team Pokémon box score above its
  timelines and summaries.
- Existing rare-event, rolling-window, comparison, leaderboard, and glossary
  modules use the same evidence scope.

## Demo Data

Appending `?demo=1` enables deterministic fake statistics for previewing the
reports. Demo data is generated in memory, clearly labeled, never written to
SQLite, preserved through navigation, and never linked to real match evidence.

## Data Integrity Rules

- Null replay-derived fields mean unknown, not zero.
- Damage, healing, turns, setup, favorable events, moves, and items keep
  separate coverage counts and rate denominators.
- Percentiles require the selected minimum covered appearances per metric.
- Held-item statistics exclude items only received through Trick/Switcheroo.
- Replay matches require a winner matching one of their two
  `season_coaches.id` participants.
- Unmatched Pokémon ownership is skipped instead of guessed.
- Unknown replay orientation uses Player 1/Player 2 labels instead of guessing.
- Lead and Tera splits remain unavailable until normalized events are stored.
- Week endpoints use independent season-level availability instead of showing
  the old `999` sentinel. Playoff weeks above 100 remain supported.
- All-season division choices are grouped by season and configured order.

## Readability and Mobile Behavior

The scoped `experimental-stats-readable` rules in `src/app/globals.css` raise
small labels to 11–13px, standard copy to 14px, brighten muted text, enlarge
controls and table cells, and improve chart labels and tooltips. Wide reports
use mobile cards or deliberate horizontal scrolling. Profile metric cards use
content-height rows instead of stretching beside the Pokémon hero.

## Event Storage Status

Available means current storage supports the metric accurately. Partial means
only part of a proposed visual is supported. Event storage required means the
replay contains the information, but PBO does not yet persist every event as a
normalized row.

A future event system should add a normalized `battle_events` table containing
match, turn, sequence, type, actor, target, Pokémon, move, item, ability,
status, value, source, and raw replay line. Use batch inserts, appropriate
indexes, cached aggregates, lazy-loaded visuals, pagination, coverage metadata,
and an auditable historical backfill. Ordinary site pages should not query it.

## Primary Files

- `src/app/experimental-stats/page.tsx`
- `src/app/experimental-stats/[module]/page.tsx`
- `src/app/experimental-stats/experimental-module-nav.tsx`
- `src/app/experimental-stats/experimental-stats-client.tsx`
- `src/lib/experimental-stats.ts`
- `src/lib/experimental-stats-data.ts`
- `src/lib/experimental-stats-demo.ts`
- `src/components/navigation.tsx`
- `src/app/sitemap.ts`
- `src/app/globals.css`
- `wiki/Public Tools And Stats.md`

## Verification Completed

- `npx tsc --noEmit`
- Targeted ESLint for Experimental Stats files
- `npm run build`
- `git diff --check`
- HTTP 200 smoke tests for the hub and all nine report routes
- Read-only integrity checks for replay winners, ownership, JSON fields,
  transferred item reveals, and per-metric coverage

The in-app browser was unavailable for automated screenshots. Routes were
opened in the user's local browser through the visible development server.
