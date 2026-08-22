# Store And Cosmetics

Parent index: [[Home|PBO Site Wiki]]

The store controls cosmetic purchases, previews, and equipped coach/team styling.

## Preview Behavior

Users should be able to preview cosmetics whether or not they already own the cosmetic. Purchase ownership controls whether they can equip or persist the cosmetic, not whether the preview can render.

## Custom Colors

The following cosmetics support custom color options:

- Team name glow
- Row background
- Row border

Custom colors should be validated as hex colors before saving.

New Team Name Glow, Row Background, and Row Border purchases are immediately
active with the Stargazer preset. Existing active purchases that predate this
default also render with Stargazer until the coach chooses another preset or a
custom hex color. A purchase must never deduct coins while remaining invisible
only because its saved color is blank.

Successful purchases, activation toggles, and color changes refresh the current
page and invalidate the public surfaces that render store cosmetics. This keeps
coach profiles, coach lists, standings, leaderboards, match pages, Matchup Prep,
Pokemon pages, and the cached homepage showcase synchronized without requiring
a manual browser refresh.

Relevant files:

- `src/components/store-modal.tsx`
- `src/app/api/store/glow-color/route.ts`
- `src/app/api/store/bg-color/route.ts`
- `src/app/api/store/border-color/route.ts`
- `src/lib/glow-utils.ts`
- `src/lib/store-cache.ts`

## Coach List Rendering

Logo frames, including champion logo frames, should render anywhere coach branding is shown on coach list/profile surfaces. Do not assume cosmetics only appear inside the store or single coach profile.

Relevant files:

- `src/app/coaches/coaches-client.tsx`
- `src/app/coaches/stats/page.tsx`
- `src/lib/glow-utils.ts`

## Logo Frames

Logo frames are store cosmetics rendered through `src/components/logo-frame.tsx`.

Logo frame price displays should use the same gold PBO Coin symbol treatment as the rest of the store UI.

Champion Gold is earned-only:

- Slug: `logo-frame-champion-gold`
- Description: earned by winning a championship in any division.
- It should not behave like a normal paid item.

Paid frame catalog additions from August 12, 2026:

- Inferno (`logo-frame-inferno`) — red/orange fire styling, 375 PBO Coins.
- Icy (`logo-frame-icy`) — pale-blue ice styling, 375 PBO Coins.
- Chromatic Flow (`logo-frame-chromatic-flow`) — animated rainbow gradient, 375 PBO Coins.

These frames use the normal permanent-purchase and single-active-frame behavior. Their catalog rows are added idempotently by `migrations/add-inferno-icy-chromatic-logo-frames.sql`.

Relevant files and migrations:

- `src/lib/logo-frame-items.ts`
- `src/lib/championship-utils.ts`
- `src/app/api/store/logo-frame-colors/route.ts`
- `migrations/add-logo-frame-store-items.sql`
- `migrations/ensure-champion-gold-earned-item.sql`
- `migrations/make-champion-gold-earned-only.sql`
- `migrations/update-logo-frame-prices.sql`
- `migrations/rename-custom-colors-logo-frame.sql`
- `migrations/add-inferno-icy-chromatic-logo-frames.sql`
