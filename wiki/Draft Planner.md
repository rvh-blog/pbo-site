# Draft Planner

Parent index: [[Home|PBO Site Wiki]]

The draft planner is a public planning tool at `/draft-planner`. It is intentionally separate from official draft state. Users should be able to plan with any eligible Pokemon even if that Pokemon is already drafted in the real league.

## Current Behavior

- The draft board is sorted by price from highest to lowest.
- The max supported planner price is 19 for the current Season 11 ruleset.
- Pokemon priced at 0 are excluded from the draft board.
- Complex-ban notes from `season_pokemon_prices.complex_ban_reason` are shown on candidate cards.
- Pokemon with invalid season prices should not be treated as draftable.
- The board is scrollable from the highest price group down to 1 point.
- Drafted ownership labels are not shown in the planner.
- Tier language such as Premium, Starter, and Value is not shown in the draft board.
- Type filter labels are capitalized for readability.
- The tier filter has been removed.
- Pokemon already placed in the current plan are excluded from the candidate list.
- Candidate cards include Add and Hide actions. Hide removes only that Pokemon from the viewer's candidate list until it is shown again.
- Hidden Pokemon can be restored with the Show Hidden control.
- The planner can extend vertically on desktop when dense panels are shown.
- The Team Roster is a card grid at the top of the page, above the View toggles. All 11 slots always render as cards; each card contains a Pokemon autocomplete input for adding or editing that pick, plus sprite, types, abilities (click for description), price badge, and Tera Captain marker. Budget/Spent/Left totals sit in the section header. Pasting a multi-line list into a card fills consecutive slots.
- The Team Analyzer is its own standalone section under the Draft Needs/Draft Board workspace. It holds the type chart, stats table, and move coverage; the team sprite overview lives in the Team Roster section, not the analyzer.
- Dense analyzer tables use stable text sizes and horizontal/internal scrolling instead of viewport-width text scaling, so mobile and unusual aspect ratios remain readable.
- Notes and hidden Pokemon are saved to `/api/preferences` for signed-in users and fall back to local storage when the viewer is not signed in.

## Panel Toggles

The planner has visible toggles so users can show or hide major sections they do not want to use:

- Draft Needs
- Draft Board
- Compare
- Card Notes
- Analyzer

These are UI visibility controls only. They do not change saved planner data.

Toggle behavior details:

- The Team Roster card grid at the top of the page is always visible; it is not controlled by any toggle.
- Card Notes shows a notes textarea only on watchlisted candidate cards (or cards that already have a saved note), to keep the board compact.
- When Compare is off, the Compare action is hidden from candidate cards so the button never appears to do nothing.
- Draft planner styling uses the site theme variables directly; there is no page-specific color palette in `globals.css` beyond small interaction helpers (focus rings, hover states, sprite frames).

## Role Checklist

The role checklist should stay in sync with the role tags shown on draft board cards. If a role is removed from the checklist, related draft board wording should be removed too.

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
