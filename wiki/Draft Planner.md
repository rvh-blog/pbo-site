# Draft Planner

Parent index: [[Home|PBO Site Wiki]]

The draft planner is a public planning tool at `/draft-planner`. It is intentionally separate from official draft state. Users should be able to plan with any eligible Pokemon even if that Pokemon is already drafted in the real league.

## Current Behavior

- The draft board is sorted by price from highest to lowest.
- The max supported planner price is 20.
- Pokemon priced at 0 are excluded from the draft board.
- Complex banned or unavailable Pokemon should not be treated as draftable.
- The board is scrollable from the highest price group down to 1 point.
- Drafted ownership labels are not shown in the planner.
- Tier language such as Premium, Starter, and Value is not shown in the draft board.
- Type filter labels are capitalized for readability.
- The tier filter has been removed.

## Panel Toggles

The planner has visible toggles so users can show or hide major sections they do not want to use:

- Needs
- Draft Board
- Compare
- Notes
- Analyzer

These are UI visibility controls only. They do not change saved planner data.

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

