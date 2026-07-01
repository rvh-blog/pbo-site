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
