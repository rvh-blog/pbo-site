# Draft Planner

Parent index: [[Home|PBO Site Wiki]]

The draft planner is a public planning tool at `/draft-planner`. It is intentionally separate from official draft state. Users should be able to plan with any eligible Pokemon even if that Pokemon is already drafted in the real league.

The page header has Season / Division / Team preset selectors. They navigate via the `?coach=` and `?season=` URL params (which remain the source of truth and pre-select the dropdowns); the division selector only narrows the team list client-side. Team "Blank plan" clears the coach param. On a base load with no coach, the user's saved plan restores into the roster slots; selecting a team loads that team's real drafted roster instead.

## Current Behavior

- The draft board is sorted by price from highest to lowest.
- The max supported planner price is 19 for the current Season 11 ruleset.
- Pokemon priced at 0 are excluded from the draft board.
- Complex-ban notes from `season_pokemon_prices.complex_ban_reason` are shown on candidate rows.
- Pokemon with invalid season prices should not be treated as draftable.
- The board is scrollable from the highest price group down to 1 point.
- The board has an "Available only" switch (on by default, left of the Showing count) that hides Pokemon already drafted in the division selected in the page header. It is an opt-out filter: turning it off shows everything, with drafted mons carrying a small red team-abbreviation chip. Planning with drafted Pokemon remains allowed — the filter never blocks adding them.
- Tier language such as Premium, Starter, and Value is not shown in the draft board.
- Type filter labels are capitalized for readability.
- The tier filter has been removed.
- Pokemon already placed in the current plan are excluded from the candidate list.
- The draft board renders candidates as compact table-style rows (sprite, name, types, fit tags, SPE/BST/FIT columns, price, icon actions) under a sticky column header. Rows include watchlist, compare, Add, and Hide icon actions. Hide removes only that Pokemon from the viewer's candidate list until it is shown again.
- Hidden Pokemon can be restored with the Show Hidden control.
- Board filters: a type grid with an Is type / Resists / Strong vs mode toggle (click a type chip to filter; selections per mode combine with AND and share the resist-filter state with the Draft Needs weakness rows), a move filter (autocomplete input; selected moves become removable chips and combine with AND), a max price slider, and a speed range slider. Both sliders use the `.draft-range-dual` custom track from globals.css. A "Sort by FIT" button orders the board by FIT score; it and the stat sort dropdown are mutually exclusive (activating one clears the other), and FIT is intentionally not a dropdown option. There is deliberately no binary "fits team" filter, since the clickable Draft Needs rows cover need-specific hunting.
- FIT applies an additional viability reduction to Pokemon priced at 1-3 points
  and a smaller reduction at 4-5 points. The Fits Budget bonus scales with the
  same quality factor, so cheap role coverage does not automatically outrank a
  stronger candidate.
- The planner can extend vertically on desktop when dense panels are shown.
- The Team Roster is a card grid at the top of the page, above the View toggles. All 11 slots always render as cards; each card contains a Pokemon autocomplete input for adding or editing that pick, plus sprite, types, abilities (click for description), price badge, and Tera Captain marker. Budget/Spent/Left totals sit in the section header. Pasting a multi-line list into a card fills consecutive slots.
- The Team Analyzer (displayed title: "Team Info") is its own standalone section under the Draft Needs/Draft Board workspace. It holds the type chart, stats table, and move coverage; the team sprite overview lives in the Team Roster section, not the analyzer.
- On desktop the three analyzer sections intentionally share one row, split roughly 45% (type chart) / 30% (stats) / 25% (move coverage). Do not stack them full-width on desktop; on mobile they stack vertically.
- On desktop Draft Needs is a narrow (~300px) column to the left of the Draft Board panel, mirroring the analyzer's row-split approach; when either panel is toggled off the other takes the full width, and on mobile they stack.
- The rows in Draft Needs are toggleable board filters: clicking a role row filters the draft board to Pokemon that fill that role; clicking a weakness row filters to Pokemon that resist that type (ability immunities/resists included). Filters combine with AND, active rows show a ring, and removable chips for active filters appear at the top of the board's Filters group so the state stays visible.
- Dense analyzer tables use stable text sizes and horizontal/internal scrolling instead of viewport-width text scaling, so mobile and unusual aspect ratios remain readable.
- Notes and hidden Pokemon are saved to `/api/preferences` for signed-in users and fall back to local storage when the viewer is not signed in.
- Save Defaults (Team Analyzer header) explicitly saves settings: stat sort, tracked moves, notes, hidden Pokemon. Save Plan (primary button in the page header) saves the current roster slots as `savedPlan`; it restores on the next visit only when the viewer has no real drafted roster and has not already typed picks. The preferences API replaces the whole per-page blob, so `savedPlan` must be included in every autosave payload or it gets wiped.

## Panel Toggles

The planner has visible toggles so users can show or hide major sections they do not want to use. The toggle toolbar is shown only below the `lg` breakpoint; on desktop all sections are always visible:

- Draft Needs
- Draft Board
- Compare
- Notes
- Team Info (analyzer)

These are UI visibility controls only. They do not change saved planner data.

Toggle behavior details:

- The Team Roster card grid at the top of the page is always visible; it is not controlled by any toggle.
- Notes are independent of the watchlist: every board row has a note icon action that opens a notes textarea for that Pokemon; rows with a saved note show the icon highlighted. The Notes view toggle hides the note buttons and editors without deleting note text. Copy Plan includes watchlist notes and a separate Notes section for noted Pokemon outside the watchlist.
- When Compare is off, the Compare action is hidden from candidate cards so the button never appears to do nothing.
- Draft planner styling uses the site theme variables directly; there is no page-specific color palette in `globals.css` beyond small interaction helpers (focus rings, hover states, sprite frames).

## Role Checklist

The role checklist should stay in sync with the role tags shown on draft board cards. If a role is removed from the checklist, related draft board wording should be removed too.

Hazard setting is tracked per hazard kind (Stealth Rock, Spikes, Toxic Spikes, Sticky Web), not as one generic "hazards" role — teams want all kinds, not just one. Checklist rows show a ×N count when multiple team members provide a role. FIT role points are tiered by need and stack with diminishing returns (all scaled by the price-based quality factor): Stealth Rock and Hazard Removal earn 10/5/2 for the 1st/2nd/3rd provider; Pivot, Priority, Spikes, and Toxic Spikes earn 8/4 for up to two providers; Sticky Web earns 5 for the first provider only.

Current removed role wording includes:

- Setup wincon
- Status
- Dark type
- Fairy type
- Steel type
- Ground type

## Files

- `src/app/draft-planner/page.tsx`
- `src/app/draft-planner/draft-planner.tsx`

## Change Notes

When changing draft planner filtering, remember that this page is a planning surface, not the official roster source. Do not block planner additions just because a Pokemon is already drafted by a real team.

Season-specific pricing comes from `season_pokemon_prices`. When a new ruleset changes max price, Tera handling, or complex bans, update both the import data and the planner UI constraints so they stay aligned.

Season-specific move filters use `season_pokemon_moves`. Season 11 National Dex
learnsets are generated by `scripts/populate-season-national-dex-moves.js`,
including direct ancestor moves and reviewed retained-base behavior for Rotom
appliance forms. Use `--pokemon <name>` for a targeted regeneration. Generated
move names must resolve to the site's `moves.name` values.
