# Recent Website Updates

Parent index: [[Home|PBO Site Wiki]]

This page summarizes recent user-facing behavior changes so future work starts from the current site behavior instead of older assumptions.

## July 3, 2026

Battle Record:

- Battle Record remains a dedicated page and does not replace coach fun facts.
- The table includes coach ranking numbers, centered sortable columns, minimum-games filtering, and default sorting by games played descending.
- Coach logos fall back to the PBO logo when a coach/team logo is missing.
- Close Game Win Percentage displays as `X% (wins/losses)` and includes only close games in the parenthetical record.
- Big Win Percentage displays as `X% (number of big wins)`.
- Close Game Win Percentage and Big Win Percentage include hover definitions.
- Last 15 results were added as a table column.

Draft planner:

- Removed visible `Buffer` and `Check` wording.
- Visible fit tags are limited to role checklist tags.
- Draft board filters now include speed range and stat focus.
- Draft board sorting supports ascending/descending order, including points.
- The move coverage panel is taller while remaining mobile-compatible.
- Mobile text wrapping and compact labels were tightened to prevent overflow.

Coaches and mobile layout:

- The coaches page now supports search and multiple sort modes.
- Coach list cards show compact performance stats and differential information.
- Global mobile overflow safeguards were added for page content while preserving intentional horizontal scrolling areas.

League poll:

- Admin poll results now appear in the League Poll section of the admin dashboard.
- Admin results show aggregate percentages and vote counts only; voter identities are not shown.

Season 11+ format:

- Season 11 and later are modeled as 80 total players: 5 divisions with 16 players per division.
- The PBO season format is 8 regular-season weeks followed by 3 playoff rounds.
- A shared season format helper now centralizes these Season 11+ assumptions.
- Admin schedule upload validation checks 16 teams per division, 64 regular-season matches, weeks 1-8 only, 8 matches per week, duplicate weekly team appearances, and self-match rows.
- Admin schedule uploads create valid match rows in parallel.
- Admin rosters show Season 11+ division status counts such as `16/16`.
- Admin matches, rosters, and transactions gained search fields to make 80-player seasons easier to manage.
- Admin transaction count loading now runs in parallel across teams.
- Google Sheets match-stat sync uses the shared Season 11+ format and supports 8 fixtures per week for 16-team divisions.
- Wiglett match submissions validate against the same PBO week format: regular weeks 1-8 and playoff weeks 101-103.

Verification notes:

- `npx.cmd tsc --noEmit` passes.
- Local admin routes for matches, rosters, and transactions return 200.
- Targeted ESLint passes for the shared season format, Sheets match-stat sync, and Wiglett integration files.

## July 2, 2026

Navigation and stats:

- The header now includes a Battle Record tab beside Leaderboards.
- Battle Record is a dedicated page, not a replacement for coach fun facts.
- Battle Record lists all coaches by all-time non-forfeit completed match record.
- Default Battle Record sorting is descending games played.
- Each Battle Record column is sortable and centered.
- A row number appears to the left of the coach column.
- Coaches without a team logo fall back to the PBO logo.
- The Battle Record board has a soft white outer glow.
- A minimum-games filter can hide coaches below a chosen games threshold.
- Close Game Win Percentage displays as `X% (wins/losses)` for games decided by 1 or 2.
- Big Win Percentage displays as `X% (number of big wins)` for 5-0 or 6-0 wins.
- Tooltips define Close Game Win Percentage and Big Win Percentage.
- Battle Record includes a Last 15 column.

League poll:

- Admins can edit a site-wide poll from the admin home page.
- The active poll appears in the PBO home page Your League box and on coach profile pages.
- Coach users can vote once per poll.
- Poll results display only after the current coach has voted.
- Logged-out/spectator users do not see result bars and cannot vote.
- Users can hide the poll locally.

Performance and data loading:

- New and updated DB-backed pages load independent data in parallel.
- The home page now avoids serial personalization and poll loads where possible.
- Home page recent battles and top coach sections select narrower DB payloads.
- Battle Record filters completed non-forfeit matches in SQL and selects only needed columns.
- Added performance indexes for completed match and playoff filters.

Deployment notes:

- Apply `migrations/add-polls.sql`.
- Apply `migrations/add-performance-indexes.sql`.

## July 1, 2026

Season 11 compatibility:

- Replay scraping recognizes `[Gen 9 Champions] NatDex Draft` as the Season 11 Showdown format.
- Season 11 Champions NatDex Draft replays preserve Mega form names such as `Barbaracle-Mega` and `Floette-Mega`.
- Parsed replay output includes the replay tier so downstream tools can tell which format produced the data.
- Broadcast overlays match roster Pokemon against battle state by exact species, battle form, normalized name, and compact Pokemon id.
- Broadcast overlay sprite lookup preserves hyphenated form names where Showdown sprites require them.
- Wiglett and bot replay match recording use exact Pokemon lookup first, then normalized lookup, when mapping replay Pokemon back to rosters.
- Matchup Prep speed calculator defaults to level 50.

Fantasy:

- Weekly fantasy entries now prevent reusing the same Pokemon from the same team in later weeks of the same season.
- The same species may still be selected from a different team/division.
- Picks lock individually once that Pokemon's weekly matchup has started.
- Previously selected Pokemon/team instances are hidden from normal Pokemon Board tabs for that user.
- The Pokemon Board has a Previously Selected tab beside the division tabs so users can review prior selections.

Draft planner:

- Users can add any eligible Pokemon to their planner regardless of whether it is already drafted in the league.
- Drafted-by labels were removed.
- The max price is 20.
- Price 0 Pokemon are excluded.
- The draft board sorts from 20 down to 1 and is scrollable.
- Tier filters and tier labels were removed.
- Draft board fit scoring can still consider efficient stat-to-price options, but the visible `Value` tag is no longer shown.
- Section toggles were added for Needs, Draft Board, Compare, Notes, and Analyzer.
- Role checklist and draft board role wording were synced.

Admin and engagement:

- Pick-ems admin grouping was renamed to Engagement for broader engagement tools.
- Admin PBO Coin grants use a 10 to 500 range.
- Match participation coin rewards are 10.
- New coach starting PBO Coin is 150.
- Admin password reset no longer requires unclaiming an account.
- Engagement settings include betting closed, betting hidden, fantasy hidden, and blog hidden.
- Infinity Division public visibility can be manually released or revealed on the scheduled date.
- Admin audit logs were added for supported high-risk admin actions.
- Project Mew has a timed release and confirmation/prompt flow.

Replay analyzer and match pages:

- Replay analyzer coach stats were widened to avoid horizontal scrolling.
- Coach stat values are centered under their column headings.
- Battle Timeline is displayed under coach stats and above key events.
- Match pages include a shared admin hide/unhide control for Deciding Turns editor controls.

Store and cosmetics:

- Store cosmetics can be previewed before ownership.
- Team name glow, row background, and row border support custom colors.
- Champion/logo frames render on coach list surfaces.
- Logo frames were added as store cosmetics.
- Champion Gold logo frame is earned-only for championship winners.

Blog:

- Blog pages and APIs can be hidden by feature setting.
- Admins can create/delete posts.
- Approved coaches can create posts.
- Admins can attach image URLs to posts.
- Signed-in users can comment and reply.

Fantasy rewards:

- Weekly fantasy rewards are tracked in `fantasy_rewards`.
- Current weekly reward tiers are 100, 50, and 25 PBO Coin.

Pokemon and coach stats:

- Pokemon detail pages include a clickable all-time ranking box beside K/D.
- Ride or Die shows the top 25 within the section without extending the page.
- Season 10 Pokemon and coach fun facts are mobile optimized and use larger text.
- Pokemon and coach fun facts are tied to Season 10.
- Coach fun facts no longer include The Finisher.

## Verification From Deployment

The July 1, 2026 code update was committed as:

```text
f5d21ba Improve fantasy, draft planner, and admin tools
```

It was pushed to GitHub `main` and deployed to Fly as release `v215`.

The later Season 11 compatibility update adds replay format handling, Mega
preservation, overlay matching, Wiglett roster matching, and level 50 Matchup
Prep defaults.
