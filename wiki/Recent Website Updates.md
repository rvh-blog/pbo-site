# Recent Website Updates

Parent index: [[Home|PBO Site Wiki]]

This page summarizes recent user-facing behavior changes so future work starts from the current site behavior instead of older assumptions.

## July 1, 2026

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
