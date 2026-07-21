# Frontend Pages Workflow

Use this page when adding or changing UI.

## Structure

- Public routes live under `src/app/<route>/page.tsx`.
- Admin routes live under `src/app/admin`.
- Interactive page logic often uses a colocated client component.
- Shared components live under `src/components`.

## Data Loading

Prefer server components for initial DB reads.

Fetch independent data in parallel:

```ts
const [matches, coaches, divisions] = await Promise.all([
  getMatches(),
  getCoaches(),
  getDivisions(),
]);
```

Avoid:

- Serial independent DB reads.
- N+1 queries in render loops.
- Fetching all data when route params can scope the query.
- Client-side joins when Drizzle relations can fetch the shape directly.

## Design System

The app uses a dark retro Pokemon-inspired visual system:

- CSS variables in `src/app/globals.css`.
- Sticky navigation in `src/components/navigation.tsx`.
- Cards are generally small-radius, high-contrast dark surfaces.
- Use existing UI/components before inventing a new pattern.

## Auth States

If a page behavior changes by auth/mod status:

- Check logged-out state.
- Check coach state.
- Check spectator state where relevant.
- Check mod/admin state.

## Mobile

Check mobile width for:

- Navigation.
- Tables with horizontal overflow.
- Buttons with long text.
- Cards and chart containers.
- Fun facts pages, especially Season 10 Pokemon and coach fun facts with larger
  text.

The global header uses explicit compatibility classes and traditional pixel
media queries in addition to Tailwind layout utilities. Below 1280px, compact
search/theme/menu controls remain available; widths from 768px through 1279px
also show the tablet destination row; at 1280px and above, the full desktop
navigation and account actions display. Preserve this fallback when editing the
header so browsers that do not apply generated range-query breakpoint syntax
cannot collapse to a logo-only state.

## Matchup Prep Abilities

Matchup Prep normally reads abilities from the drafted Pokemon row. Some legal
event abilities are stored by PokeAPI on a separate form even though PBO drafts
the base species. The server-side matchup-prep formatter merges those explicit
event options into the card data and deduplicates them by ability name.

Greninja therefore displays Battle Bond alongside Torrent and Protean on both
active-roster and dropped-Pokemon cards. Keep event-form additions explicit so
separately draftable competitive forms do not have their abilities combined by
accident.

## Recent Feature Pages

Feature-specific notes:

- [[Fantasy]]
- [[Draft Planner]]
- [[Admin And Engagement]]
- [[Store And Cosmetics]]
- [[Blog]]
- [[Public Tools And Stats]]
- [[Recent Website Updates]]

## See Also

- [[Feature Map]]
- [[Change Guide]]
- [[Verification Runbook]]
