# Change Guide

This page is written for agents making code changes. Read it before modifying behavior.

Parent index: [[Home|PBO Site Wiki]]

High-risk workflows:

- [[Match Results Workflow]]
- [[Rosters And Transactions Workflow]]
- [[Replay Analysis Workflow]]
- [[Sheets Sync Workflow]]
- [[Frontend Pages Workflow]]

## First Checks

Before editing:

1. Check the dirty worktree.
2. Read the files you will edit.
3. Identify whether the change touches persistent data, result cascades, transactions, or external sync.
4. Prefer existing helpers and patterns over new abstractions.

Useful commands:

```bash
git status --short
rg -n "term" src
rg --files
```

Do not revert unrelated user changes.

For shared work, use [[GitHub Collaboration Runbook]]: branch, verify, push, open a pull request, merge to `main`, then deploy merged `main` to Fly.

## Safe Data Changes

If changing tables or fields:

- Update `src/lib/schema.ts`.
- Generate or write a migration.
- Check API routes and admin pages that construct insert/update payloads.
- Check import/seed scripts if the field is required.
- Check sheet sync if the field is reflected externally.
- Check bot/Wiglett integrations if they write the entity.

Do not assume declared references cover all invariants. Many invariants are application-level.

## Match Result Changes

Changing result behavior is high risk.

Read:

- `src/app/api/matches/route.ts`
- `src/lib/elo-service.ts`
- `src/lib/betting.ts`
- `src/lib/kill-betting.ts`
- `src/lib/death-betting.ts`
- `src/lib/pick-em-rewards.ts`

Consider all cascades:

- Match result fields.
- Match Pokemon rows.
- Kill events.
- Elo.
- Match coins.
- Winner bets.
- Kill/death bets.
- Pick-em weekly rewards.
- Game of the Week rewards.

Historical result edits may require full Elo recalculation. If a route returns `needsFullRecalc`, do not hide that from the UI.

## Roster And Transaction Changes

Read:

- `src/lib/transaction-service.ts`
- `src/lib/roster-utils.ts`
- `src/app/admin/transactions/page.tsx`
- `src/app/admin/rosters/page.tsx`

Risks:

- Transaction history reconstructs historical rosters.
- Bulk roster edits can bypass transaction history.
- P2P trades are represented by one row but affect two teams.
- Tera changes affect roster price and remaining budget.
- Free agent pools are division-specific.
- Some transaction flows are multi-step without explicit DB transactions.

If adding new transaction behavior, include undo behavior or explicitly document that undo is unsupported.

## Sheets Sync Changes

Read:

- `src/lib/sheets-sync-all.ts`
- `src/lib/sheets-roster-sync.ts`
- `src/lib/sheets-match-stats-sync.ts`
- `src/lib/sheets-transaction-sync.ts`

Assume sheet layout is a contract. Changes to tabs, ranges, team labels, or Pokemon mapping can silently break sync.

When changing sync:

- Test with a non-production sheet.
- Check the division's sync toggles.
- Check sheet-side `Config!B2`.
- Prefer batched reads/writes.
- Keep roster/transaction sync independent from match result sync where possible.

## Pokemon Name Normalization

The central source of truth for Pokemon name formats is:

- `src/lib/pokemon-name-utils.ts`

Keep name behavior centralized there. If a bug report mentions Pokemon aliases,
alternate spellings, friendly display names, regional names, Mega names, form
names, or sheet/Wiglett name formats, update the central normalizer and lookup
helpers in `pokemon-name-utils.ts`; do not add a separate alias table or local
normalizer in a caller.

Use the exported helpers consistently:

- Use `normalizePokemonName()` when a flow needs one canonical Pokemon name.
- Use `pokemonExactLookupKeys()` / `pokemonNormalizedLookupKeys()` when matching
  external input against DB rows, roster rows, or sheet Pokedex rows.
- Use `pokemonSearchAliases()` for autocomplete/search surfaces.

Callers such as Sheets sync, Wiglett, bot match recording, replay parsing,
overlays, draft planner, and autocomplete should all route through these helpers
so one file stays responsible for name behavior.

Be careful with competitive forms. Some visual or battle-state forms collapse to
base species, but forms that PBO drafts separately must remain distinguishable.
For example, `Urshifu-Single-Strike` and `Urshifu-Rapid-Strike` are separate DB
Pokemon, while replay preview may initially show `Urshifu-*`.

## Replay Parser Changes

Read:

- `src/app/api/replay-scrape/route.ts`
- `src/app/admin/matches/page.tsx`
- `src/bot/services/match-service.ts`
- `src/lib/wiglett-integration.ts`

The parser has multiple consumers. Public analyzer output can differ from PBO match-recording needs, but match recording must keep roster matching stable.

If adding parser options, default them to existing PBO behavior and opt in from the new consumer.

## New Pages And APIs

For Next.js app routes:

- Put public pages under `src/app/<route>/page.tsx`.
- Use server components for DB reads when possible.
- Use client components only for interactive state.
- Fetch independent data in parallel with `Promise.all`.
- Avoid repeated DB calls inside render loops.
- Use shared components (`Navigation`, `HpChart`, schedule/match components, UI primitives) where they fit.
- Match the existing dark retro visual system unless the request asks for a new design direction.

For API routes:

- Validate IDs and cross-entity consistency, not just presence.
- Return structured errors.
- Keep write cascades explicit.
- Prefer shared service functions over duplicating business logic.

## Performance Patterns

Preferred patterns:

```ts
const [a, b, c] = await Promise.all([
  getA(),
  getB(),
  getC(),
]);
```

Avoid:

- Serial independent DB reads.
- N+1 queries in maps.
- Fetching all seasons/matches when route params provide a smaller scope.
- Client-side joins for data that can be joined with Drizzle relations.

Use `DEBUG_DB=true` locally if query logging is helpful.

## Verification

At minimum:

```bash
npx tsc --noEmit
npx eslint <changed files>
```

For UI:

- Run `npm run dev`.
- Open the route.
- Test desktop and mobile if layout changed.
- Check logged-in and logged-out states if auth is involved.

For data writes:

- Test against a copied local `pbo.db`.
- Verify related tables, not just the primary table.
- For match results, inspect match, match Pokemon, Elo, bets, pick-em rewards, and coins.

## Things To Avoid

- Do not edit production DB without a backup.
- Do not upload local DB to production casually.
- Do not commit `pbo.db`, WAL/SHM files, secrets, or generated `dist/` unless explicitly intended.
- Do not deploy unreviewed local-only code when the change is meant to go through GitHub.
- Do not change name normalization without checking roster matching, sheets, replay parsing, and integrations.
- Do not delete seasons/divisions without accounting for all dependent rows.
- Do not assume a single `coachId` identifies a team in a season.
