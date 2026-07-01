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

Relevant files:

- `src/components/store-modal.tsx`
- `src/app/api/store/glow-color/route.ts`
- `src/app/api/store/bg-color/route.ts`
- `src/app/api/store/border-color/route.ts`
- `src/lib/glow-utils.ts`

## Coach List Rendering

Logo frames, including champion logo frames, should render anywhere coach branding is shown on coach list/profile surfaces. Do not assume cosmetics only appear inside the store or single coach profile.

Relevant files:

- `src/app/coaches/coaches-client.tsx`
- `src/app/coaches/stats/page.tsx`
- `src/lib/glow-utils.ts`

## Logo Frames

Logo frames are store cosmetics rendered through `src/components/logo-frame.tsx`.

Champion Gold is earned-only:

- Slug: `logo-frame-champion-gold`
- Description: earned by winning a championship in any division.
- It should not behave like a normal paid item.

Relevant files and migrations:

- `src/lib/logo-frame-items.ts`
- `src/lib/championship-utils.ts`
- `src/app/api/store/logo-frame-colors/route.ts`
- `migrations/add-logo-frame-store-items.sql`
- `migrations/ensure-champion-gold-earned-item.sql`
- `migrations/make-champion-gold-earned-only.sql`
- `migrations/update-logo-frame-prices.sql`
- `migrations/rename-custom-colors-logo-frame.sql`
