# Recent Website Updates

Parent index: [[Home|PBO Site Wiki]]

This page summarizes recent user-facing behavior changes so future work starts from the current site behavior instead of older assumptions.

## July 17, 2026

Replay and broadcast matching:

- Showdown forms such as `Silvally-Fairy`, `Silvally-Bug`, and other `Silvally-*` names now normalize to the drafted base `Silvally` row during replay scraping and admin roster matching.
- The shared normalization change propagates to both broadcast overlay variants, so typed Silvally forms match the roster and remain visible in overlay battle state.
- Broadcast matching now treats `Gourgeist-Average`, `Gourgeist-Small`, `Gourgeist-Large`, and `Gourgeist-Super` as one visual form family. The roster keeps its stored/displayed form while any Gourgeist form emitted by Showdown can match it in the overlay.
- Broadcast matching now treats `Floette-Eternal` as the pre-Mega battle form for a rostered `Floette-Mega`, keeping the slot visible before and after Mega Evolution.
- Replay favorable-miss statistics now exclude misses caused by Phantom Force semi-invulnerability while continuing to count ordinary accuracy misses.

Homepage:

- Infinity division badges in the Battle Log now use the pink Infinity accent (`#E2A3C7`) like the other division badges.
- Infinity color lookup handles case differences and the defensive historical `Infinty` spelling.

Maintenance:

- The Move Usage index is now ensured during normal database startup.

Verification:

- `npx tsc --noEmit` passes.
- Targeted ESLint passes for the changed files.
- Silvally normalization checks pass for hyphenated, spaced, underscored, and base names.
- The supplied replay `2649848831` now records zero favorable Phantom Force misses for Dragapult while preserving the legitimate Stone Edge miss.

## July 16, 2026

Battle Record Move Usage:

- Added a Move Usage tab beside Coach Records and PBO Records.
- Replay `|move|` events are attributed to the active Pokemon and aggregated into per-Pokemon and overall move totals.
- Move Usage includes Season 9 and onward, including historical Season 9 divisions whose `played_at` value is blank.
- Division filters are grouped by season and ordered from highest to lowest tier: Infinity, Neon, Crystal, Sunset, and Stargazer.
- Move data is backfilled offline so replay scraping does not run during page loads. The local development backfill processed 261 replay-backed matches and 3,131 Pokemon rows with zero failures.
- Selected Pokemon with no detected move usage remain represented with zero moves instead of being dropped from the aggregate.
- Added a match move-record index and verified the Move Usage query plan uses the match and match-Pokemon indexes.

Resilience and public-page performance:

- Added a global error boundary with a retry action so a single rendering failure shows a recoverable page instead of a blank exception screen.
- Client error-boundary reports now reach structured server logs through `/api/client-errors`.
- Public Pokemon Stats and Fun Facts data loaders cache their results for five minutes.
- Those stats routes render at runtime so the Docker image does not try to query the development-only SQLite database while building.
- Public roster payloads and season reference data are cached for five minutes, while roster queries are limited to the selected division's teams and required columns.
- Pokemon Stats and roster data loaders now select only fields used by their calculations and UI.
- The Move Usage match filter index is created both by migration and by the normal startup performance-index guard.

Visual updates:

- Battle Record tabs use a soft-blue active/inactive treatment.
- Navigation active and hover underlines use soft yellow.
- The PBO logo and View Season action use crimson red.
- Public division roster grids use a maximum of four columns on large screens.

Production incident:

- The live `match_pokemon` table was repaired with the additive `moves_used` column after production logs showed a schema mismatch. Existing match data was preserved, and the health, homepage, and Battle Record routes returned 200 after the repair.

Verification:

- `npx tsc --noEmit` passes.
- Targeted ESLint passes with existing raw-image warnings only.
- Local Stats, Fun Facts, and roster routes returned 200.
- The Fly image build was smoke-tested; its first attempt exposed the missing build-time SQLite database and the runtime-rendering safeguard was added before release.
- Production Move Usage backfill completed for 271 Season 9+ matches, updating 3,251 Pokémon rows with zero failures.

## July 15, 2026

Fantasy and performance:

- Fantasy Pokémon Board filters now support exact point totals, so users can show only Pokémon at a selected cost.
- Large Fantasy Pokémon lists render progressively, with a Show More control instead of loading every row at once.
- Public Fantasy data is cached briefly and repeated weekly Pokémon statistics are precomputed for faster page loads.
- Fantasy entry selection is lazy-loaded, and reward settlement uses one database transaction so coin balances and reward records cannot partially update.
- Match and Fantasy writes refresh the affected precomputed weekly statistics.

Fantasy rewards:

- Weekly Fantasy rewards are now 250 PBO coins for first place, 125 for second place, and 75 for third place.

Replay and sheet sync:

- Replay roster matching now accepts normalized database and Showdown spellings, including Urshifu Single Strike variants.
- Unmatched replay Pokémon are logged instead of being silently omitted from recorded match statistics.
- The Infinity Grass Graspers vs Stockholm Staraptors discrepancy was traced to the missing Urshifu-Single-Strike `1 K / 1 D` row; the stored website match remains correctly recorded as 2–0.

Verification:

- `npx tsc --noEmit` passes.
- Targeted ESLint passes with pre-existing warnings only.
- `npm run build` passes.

## July 14, 2026

Performance and rendering:

- Added shared public and admin loading states so route transitions stream a useful skeleton instead of a blank page.
- Reduced database payloads on Coaches, Leaderboards, Seasons, Draft Planner, the Admin Dashboard, and the Audit Log by selecting only fields used by each view.
- Coach filtering now indexes season entries and matches once instead of rescanning every full dataset for every coach.
- The Audit Log is paginated at 50 entries per page.
- Pokémon alias maps use a short in-process cache and are invalidated after alias or collapse edits.
- Broadcast battle WebSockets pause while the overlay tab is hidden and reconnect when it becomes visible again.

Admin Control Center:

- The responsive admin shell, dashboard action queue, compact dashboard metrics, command search, mobile drawer, and persistent desktop collapse state are documented in [[Admin Control Center|Admin Control Center]].
- The admin navigation uses Battles as the group label and a Poké Ball icon for Pokémon.
- Admin dashboard queries now use count-oriented projections for teams, matches, rosters, transactions, sheets, pick-ems, and audit activity.

Power Rankings slideshow:

- Team slides now include a Speed Tiers panel showing each active roster Pokémon's base Speed, sprite, and name sorted fastest to slowest.

Public Pokémon lists:

- `Mimikyu-Totem-Busted` and `Mimikyu-Totem-Disguised` are hidden from public search, roster selectors, and Draft Planner lists.
- The regular `Mimikyu-Busted` and `Mimikyu-Disguised` forms remain available, and historical match data is preserved.

Match detail:

- Hazard-damage metric cards are shorter with reduced internal spacing between their labels and values.

Verification:

- `npx tsc --noEmit` passes.
- The production build passes. Targeted slideshow lint still reports pre-existing warnings/errors in the untouched hover callback and legacy `any` usage.

## July 13, 2026

- Completed Season 11 and later match pages consistently use the compact battle
  report layout, whether or not a replay URL is present.
- The redundant `MATCH RESULTS / COMPLETED` page-heading card is omitted for
  the compact Season 11+ report. Older seasons and upcoming matches retain the
  standard page heading.
- Match statistics and deciding-turn descriptions remain match-specific data;
  the layout change does not copy values from another game.
- Both overlay variants share a narrowly scoped Mega Dragalge battlefield
  sprite override. It supports the known Mega name aliases, leaves regular
  Dragalge unchanged before Mega Evolution, preserves Showdown's animation
  objects, and uses a controlled emergency image fallback instead of a broken
  image icon.
- Both overlay sidebars use bounded brought-Pokemon rows, preventing the sixth
  team member from being covered by Bench when all six preview slots match.

## July 11, 2026

Season 11 Stat Points:

- Matchup Prep Speed Comparison uses the Pokemon Champions Stat Point model for Season 11 only: level 50, fixed 31-IV-equivalent stats, 0-32 SP per stat, and 66 SP total per Pokemon.
- Season 11 Speed Comparison replaces separate EV and IV controls with one SP control. Historical seasons retain their existing level, EV, and IV controls.
- Both broadcast damage-calculator routes use legal 32/32/2 SP presets for Season 11 and translate SPs to the equivalent level-50 EV values before calling `@smogon/calc`.
- Shared SP validation rejects fractional, negative, over-32-per-stat, and over-66-total spreads.
- Wiglett payloads do not contain or calculate EVs, IVs, or SPs, so its draft-pick and match-result contracts are unchanged.

Fantasy Scout:

- Schedule division names are normalized before tab filtering and color lookup. This allows live Infinity schedule rows saved with trailing whitespace to appear under the normalized Infinity tab.

Power Rankings:

- All public-season division rankings are preloaded through the shared server-side standings sorter instead of recomputing older seasons from client API responses.
- Ranking rows now include differential, Elo, recent three-match form, current streak, last result, and movement since the standings before the latest completed week.
- Slideshow schedule entries display full opponent team names instead of abbreviations.

Global search:

- The search dialog renders through a document-body portal so navigation stacking contexts cannot cover or clip it, and focus is deferred until the portal is mounted.
- The keyboard shortcut only opens the currently visible navigation search trigger.
- Pokemon search falls back safely when an older local database does not yet have the optional custom alias/collapse tables.

Broadcast overlays:

- Both broadcast overlay routes now load the shared custom Pokemon alias and collapse maps when constructing their server-rendered roster payloads.
- Overlay rosters include the same lookup keys used by the broadcast API, and the legacy overlay client now uses alias-aware species, battle-form, and team-side matching.
- Both overlays continue to receive division accents from the shared division color helper, including Infinity color `#E2A3C7`.

Matchup Prep:

- The header links to the Nimbasa City Post VGC Damage Calculator in a new tab.
- The external calculator link includes visible attribution thanking Nimbasa City Post and asking users to support them.

Homepage stats:

- The Champion summary card was replaced by Matches Played.
- Matches Played counts completed matches in the current public season, while Battles remains the completed all-time public-season total.

Power Rankings:

- Every public season and division now uses the shared server-side standings calculation, including replacement-coach history and the full standings tiebreakers.
- Ranking rows show movement from the standings before the latest completed week, differential, recent three-match form, current streak, coach Elo, and the latest opponent, result, and score.
- Slideshow schedule rows and matchup details display full opponent team names instead of abbreviations.

Theme support:

- The site now supports persistent light and dark themes from a sun/moon control in desktop and mobile navigation.
- Dark remains the default. The selected theme is stored in browser local storage and applied before the page renders to avoid a theme flash.
- Shared backgrounds, cards, borders, navigation, footer content, status colors, Battle Log rows, week badges, and score boxes have light-theme contrast rules.
- Existing inverse white text remains white on colored actions, banners, gradients, and team-customized backgrounds.

Fantasy Scout:

- Fantasy Scout now exposes Season 11 and later only. The Season 10 selector and direct Fantasy Scout selection path are no longer available.

PBO record corrections:

- Admin navigation now includes `Admin -> Records` at `/admin/battle-records`.
- Admins can replace one Regular Season or Playoff PBO Records category with up to three display entries, including optional internal or HTTPS links.
- A correction reason is required. Overrides can be disabled or deleted to restore the live automatic calculation.
- Record calculations and source match data remain unchanged; the override is applied only to the final PBO Records display.
- Create, update, disable, and delete operations write to the admin audit log.
- The `battle_record_overrides` table is covered by `migrations/add-battle-record-overrides.sql` and is also ensured at runtime.

Verification notes:

- TypeScript, targeted ESLint, Git whitespace checks, and the full production build pass.
- Override create/read/delete storage was tested against a copied local database.

## July 10, 2026

Pokemon API performance:

- Admin Pokemon and Admin Rosters now request compact Pokemon response views instead of downloading unused moves, abilities, artwork, and base-stat fields.
- The Admin Pokemon view keeps identity, display, sprite, type, and selected-season price fields.
- The Admin Rosters view additionally keeps name aliases, Tera cost, and Tera-ban fields required by roster editing and bulk reconstruction.
- The legacy full Pokemon response and all Pokemon write routes remain unchanged for compatibility with other callers.
- This response-only optimization does not change transactions, time-synced roster reconstruction, roster sorting, availability, replay matching, name normalization, or sprite display/loading behavior.

Battle Record:

- The page header keeps separate boxed tabs for Coach Records and PBO Records.
- PBO Records now separates Regular Season and Playoffs, with Regular Season selected by default.
- Each section independently computes its top three streak, differential, Pokemon, turn-count, duration, and K/D records.
- Playoff records include Most Consecutive Playoff Appearances, counted once per coach per consecutive season.
- Regular-season Best/Worst Differential uses each team's final regular-season differential, including forfeits.
- Equal worst differentials are ordered by the worse win-loss record, then recency. Detroit Zoroarks therefore ranks third for S7 Neon at 0-8 and -28.
- Record labels, descriptions, punctuation, singular/plural handling, and K/D terminology were standardized.
- PBO record categories continue to return the top three entries, and the intentionally excluded Most Viewers category remains absent.

Historical replay data:

- S6 Sunset Quarterfinal match 2448, Sunnyside Screamtails vs Tokyo Teddiursas, is linked to Showdown replay `gen9draft-2174330272`.
- The replay parses as a 7-turn 6-0 Sunnyside win and is the fastest playoff game by turns.
- Adding replay metadata preserves the existing winner, differential, Elo, betting state, and historical Pokemon rows.

Site copy:

- User-facing copy received a site-wide static grammar pass covering punctuation, articles, plurals, capitalization, YouTube terminology, Pokemon terminology, playoff explanations, Project MEW, store rules, search and poll messages, Draft Planner instructions, and match-stat labels.

Preserved behavior:

- Transaction history and time-synced roster reconstruction behavior is unchanged.
- Coach-profile and division roster Pokemon are sorted by point total descending only after the correct historical/current roster is reconstructed.
- Compact mobile roster cards continue to clip overflow, while sprite hover scaling remains desktop-only.
- Roster sprite images continue to use lazy loading and asynchronous decoding.

Verification notes:

- `npx.cmd tsc --noEmit` passes.
- Targeted ESLint passes with no errors; remaining warnings are pre-existing.
- The full Next.js production build passes and generates all 84 static pages.
- The local database copy is still missing `pokemon_name_aliases` and `pokemon_name_collapses`; their existing migrations must be applied before local Draft Planner and replay-parser routes can use custom name mappings.

Release boundary:

- The Battle Record and copy changes are source changes and follow the normal GitHub pull-request and Fly deployment workflow.
- The match 2448 replay update is a database-only correction. It is not part of the Git commit or Docker image and must be applied separately to production using the database and production-safety runbooks.
- The two local Elo CSV exports are reference files only and must remain untracked.

## July 9, 2026

Coach roster pages:

- Coach profile roster cards now display Pokemon by point total descending. Ties fall back to draft order/acquired week, then Pokemon name, so transaction-driven visibility still determines which Pokemon appear before display ordering is applied.
- Division roster pages use the same point-descending display order for each team's roster.
- Mobile coach roster cards now clip compact card and sprite overflow, lazy-decode sprites, and keep sprite hover scaling desktop-only to reduce mobile browser paint artifacts.

Verification notes:

- `npx.cmd tsc --noEmit` passes.
- Targeted ESLint for the touched coach roster files still reports pre-existing coach page lint debt such as legacy `any`, unused imports, `<img>` warnings, and one unescaped apostrophe.

## July 5, 2026

Home page:

- Recent Draft Picks now refreshes itself every 15 seconds while the page is visible, so live draft updates appear without a manual browser refresh.
- Recent Draft Picks division cards now order Infinity before Stargazer.
- Each Recent Draft Picks division card now includes a Draft Board button that opens that division's draft board directly.
- The signed-in coach Draft Board shortcut now opens the coach's own division-specific draft board.

Draft planner:

- The planner now excludes Pokemon already placed in the current plan from the candidate list.
- The old Available Only toggle was removed because the planner is not tied to one official division availability state.
- Candidate cards now include a Hide button next to Add so users can hide individual Pokemon from their planner view.
- Hidden Pokemon can be brought back with the Show Hidden control.
- Planner notes, hidden Pokemon, and defaults save through account preferences when the user is signed in, with browser local storage as a fallback.
- Planner notes are saved when the user navigates away from or closes the site.

Pokemon names and sheets sync:

- Mega Pokemon display names and aliases now use the central Pokemon name normalizer.
- Season 11 and later can match variations such as `mega-delphox`, `delphox-mega`, and `Mega Delphox`.
- The central normalizer now advertises both hyphenated and spaced form aliases for differentiated Pokemon, including `urshifu-single-strike`, `urshifu rapid strike`, `urshifu-single`, `urshifu rapid`, `tornadus-incarnate`, genie `-I`/`-T` shorthand, and similar form names.
- Bare replay `Urshifu` is consistently canonicalized to `Urshifu-Single-Strike`; Rapid-Strike remains a separate explicit form across replay stats, Sheets sync, bot recording, and both broadcast overlays.
- Draft Planner, Fantasy, and Google Sheets sync use the central normalizer where mega display aliases are needed.
- The Season 11+ mega alias behavior is intentionally gated so Season 10 and earlier keep their existing behavior.

Verification notes:

- Targeted ESLint passed for the changed app, component, and sync files.
- `npx tsc --noEmit` passed.

Admin:

- League poll admin now has separate controls to start a new poll, update the current poll, and end the active poll.
- Starting a new poll deactivates older polls and gives the new question a clean vote history.

## July 4, 2026

Performance:

- Public read APIs for Pokemon, seasons, divisions, rosters, and standings now send short cache headers so repeat visits and shared edge caches can reuse safe public data briefly.
- Mod/admin-visible season, division, and roster responses remain `no-store` so private data is not cached.
- Public API cache windows were strengthened: Pokemon now caches longer because reference data changes rarely, while seasons, divisions, rosters, and standings use moderate shared-cache windows.
- Static `/images/...` assets now send cache headers for faster repeat page loads.
- SQLite startup skips write-style optimization during `next build`, reducing build-time database lock warnings.
- Runtime startup now ensures additional read indexes exist for common public lookups, standings, roster reads, coach-removal safety checks, bets, pick-ems, and season Pokemon prices.
- Added `migrations/add-public-read-performance-indexes.sql` and mirrored the index definitions in `src/lib/schema.ts`.

Season 11 launch checks:

- Season 11 is the current public season with public schedules.
- Season 11 uses a 115-point draft budget.
- The Season 11 draft board imports from the S11 Tiers sheet into `season_pokemon_prices`.
- Season 11 draft prices are capped at 19 points; 20- and 21-point sheet columns are ignored.
- Season 11 ignores Tera data: no Tera captain costs, no Tera banned flags, and no S11 roster Tera captain flags.
- The Season 11 draft board hides Tera legend labels when the season has no Tera data.
- Complex bans are represented with `complex_ban_reason` and shown on the draft board and planner candidate cards.
- Confirmed complex bans include Mega Blastoise, Mega Kangaskhan, Mega Greninja, Mega Barbaracle, Zygarde, and Zygarde-10%.
- Wiglett is present in the Season 11 board at 1 point.
- S11 team remaining budgets were recalculated from the 115-point budget and current roster prices.

Draft planner:

- The default no-season planner view follows the newest/current season, so it now opens against Season 11.
- The max price slider caps at 19.
- Candidate cards show complex-ban notes such as `No Shell Smash`.
- The Draft Planner and season Draft Board now share a hideable draft rules disclaimer.
- The disclaimer includes the 115-point budget, 10-11 Pokemon roster size, 0-2 Mega Pokemon limit, mixed draft timing, Smogon clauses, banned moves, banned legacy items, and Z-Move/Dmax/Tera ban notes.
- The disclaimer hide/show preference is saved in the viewer's browser.

Standings:

- Full division standings now show only the PBO relegation zone marker by division: Infinity bottom 2, Stargazer bottom 3, Sunset bottom 3, Crystal bottom 3, and no Neon relegation zone.
- The projected promotion and safe-zone markers were removed from standings.

Blog:

- Blog post image rendering now supports direct image URLs and Imgur album/gallery URLs.
- Imgur album/gallery links render as embedded albums instead of broken image tags.
- Admin blog authors can upload images directly from the new post form. Uploaded images are stored under `/images/blog/...` and saved as the post image URL.

Home page:

- The synced home page grid now recalculates desktop height after resizing and clears the synced height on mobile widths.
- Shrinking the page and returning to full screen should restore the original desktop layout.
- The Your League box was condensed and centered, with action links aligned in the middle.
- The Your League action grid uses responsive wrapping so boxes do not overlap as the viewport aspect ratio changes.
- A Draft Board action was added under Match Prep.

Admin:

- Admin rosters now blocks unsafe season coach removal with a clear blocker list instead of silently failing.
- Admin rosters includes a Move Division action for season coaches. Moves are allowed only when division-scoped data such as matches or playoff bracket rows will not be left inconsistent.
- Admin season editing now supports uploading, replacing, and clearing division logos. Uploaded logos are stored under `/images/divisions/...`.
- Admin schedule upload now shows a disabled Upload Schedule CSV control with instructions until a division is selected, then shows the real CSV upload control.

Season 11 cleanup:

- The local fake Season 11 setup no longer copies Season 10 schedules into Season 11.
- The local fake Season 11 setup no longer copies test rosters into Ottawa Donphans or Richmond Ragingbolts.
- Season 11 Palafin draft board import handling now maps Palafin to Palafin-Hero so Palafin-Hero can keep its 17-point price separately from regular Palafin.

Verification notes:

- `npx tsc --noEmit` passes.
- Targeted ESLint passes for changed files where run; some admin pages still have pre-existing lint warnings unrelated to these changes.
- Local route checks passed for `/`, `/seasons/15/draft?division=46`, `/draft-planner`, and `/draft-planner?season=15`.

## July 3, 2026

Home page:

- The Your League action chips are sized to their text instead of stretching across the row.
- The active-team Your League cards use bounded desktop columns.
- Player Showcase Slot owners now remain visible in the home page Top Trainers list even when they are outside the normal top five, and they display a Showcase badge.

League poll:

- Hidden home page and coach page polls now render a compact placeholder with an Unhide control.

Store and cosmetics:

- Store PBO Coin icons now use the shared gold coin treatment, including logo frame prices.

Draft planner:

- The Team Analyzer is now a standalone section below the Draft Needs/Draft Board workspace.
- The draft planner page can extend vertically instead of clipping the Analyzer on desktop.
- Analyzer text sizing no longer depends on viewport width; dense tables scroll instead of shrinking text for mobile and unusual aspect ratios.
- The planner layout was condensed with tighter panel spacing, shorter candidate cards, and internal scrolling for dense sections.

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

## July 4, 2026

Coaches page:

- The public Coaches page now has a desktop table layout with sortable columns for coach, team, games played, wins, losses, win percentage, differential, seasons, and Elo.
- Current-season coach filtering is exposed as a visible `All / Active / Inactive` button group.
- Active status uses the latest season's active `season_coaches` rows, so inactive/replaced teams are not treated as active merely because they belong to the current season.

Infinity division color:

- Infinity uses division color `#E2A3C7`.
- Infinity uses darker shadow color `#B85A8D`.
- Division color lookup accepts the saved spelling `Infinity`, a defensive `Infinty` alias, and case-insensitive matches.
- Infinity color is applied across shared division color helpers, home page division accents, season overview standings cards, division detail headers, standings panels, kill leaders panels, schedule panels, fantasy, power rankings, slideshow data, and broadcast overlay data.

Broadcast and overlays:

- Broadcast setup now uses the normal seasons API so logged-in mods can select hidden/private divisions such as Infinity.
- Public callers remain filtered by the seasons API visibility rules.
- Overlay division context treats Infinity as a top-tier division.

Admin uploads and production data:

- Admin image upload limits for blog images, division logos, and team logos are now 10MB.
- Production was migrated to include the missing fantasy entry tables so safe coach removal checks no longer fail on `fantasy_entry_picks`.
- Season 11 National Dex move overrides were normalized to site move names so moves like `stealth-rock` resolve correctly for Mega Excadrill and other Pokemon.

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
- Current weekly reward tiers are 250, 125, and 75 PBO Coin.

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
# July 12, 2026

Fantasy:

- The About panel now documents weekly roster size and budget, division slots,
  reuse restrictions, per-match pick locks, scoring, leaderboards, and rewards.
- Pokemon Board search ranks Pokemon-name matches above team-name-only matches.

Draft planner and Season 11 moves:

- FIT discounts 1-3 point candidates more heavily, applies a smaller discount
  at 4-5 points, and scales the budget bonus by candidate quality.
- The Season 11 National Dex generator retains base Rotom moves for appliance
  forms while keeping form-exclusive signature moves separate.
- The full 1,239-Pokemon Season 11 board was regenerated locally: every board
  Pokemon has a non-empty learnset and all move names resolve to PBO move rows.
- Rotom form aliases accept base-first and descriptor-first forms such as
  `Rotom-Wash`, `Rotom Wash`, `Wash Rotom`, and `Wash-Rotom`.

Home and playoffs:

- Admin-selected Games of the Week appear below the public home statistics for
  the highest configured featured week.
- The Matches Played stat card was removed; Coaches, Seasons, and Battles use a
  three-column layout.
- The playoff hierarchy now lists Infinity above Stargazer and identifies
  Infinity as the top division.

Admin:

- The Season Setup Checklist is reusable for every season and can be hidden or
  shown from its card header.

Verification:

- `npx tsc --noEmit` passes.
- Targeted ESLint passes for the changed TypeScript/TSX files.
- Full Season 11 move validation passes for missing rows, empty learnsets,
  unresolved move names, evolution branches, and permanent form signatures.
