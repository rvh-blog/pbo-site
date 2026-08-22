# Verification Runbook

## Baseline Checks

```bash
npx tsc --noEmit
npx eslint <changed files>
```

Use targeted ESLint because whole-project `npm run lint` currently reports pre-existing unrelated errors.

Pull requests run the same baseline automatically in `.github/workflows/ci.yml`,
including changed-file lint, manifest validation, the production build, the
public-image budget, and TypeScript. Desktop/mobile visual snapshots require a
current copied database and run locally because production data is not stored in
GitHub.

## Build Check

For broader changes:

```bash
npm run build
```

This also catches Next.js route/build issues.

Asset changes should also pass:

```bash
npm run assets:check
```

## UI Check

1. Run `npm run dev`.
2. Open the touched route.
3. Check desktop and mobile.
4. Check loading/error/empty states if applicable.
5. Check logged-out/logged-in/mod states if auth is involved.

## Data Write Check

Use a copied local DB.

For match result changes, inspect:

- `matches`
- `match_pokemon`
- `kill_events`
- `elo_history`
- `coaches.pboCoin` / `users.pboCoin`
- `bets`
- `kill_bets`
- `death_bets`
- `pick_em_rewards`

For transaction changes, inspect:

- `rosters`
- `transactions`
- `season_coaches.remainingBudget`
- time-synced roster output before/after transaction week.

## Integration Check

For Sheets:

- Use a non-production spreadsheet.
- Check toggles.
- Check `Config!B2`.

For Wiglett:

- Use a unique test `eventId`.
- Verify idempotent replay with the same `eventId`.

For Discord:

- Use `DISCORD_DEV_GUILD_ID` for immediate command testing.

## See Also

- [[Change Guide]]
- [[Local Development Runbook]]
- [[Production Safety Runbook]]
