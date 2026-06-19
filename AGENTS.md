# Agent Instructions

Read this before making changes.

## Primary Context

Start with the repo wiki:

- [wiki/README.md](wiki/README.md)
- [wiki/runbooks/GitHub Collaboration Runbook.md](<wiki/runbooks/GitHub Collaboration Runbook.md>)
- [wiki/Operations.md](wiki/Operations.md)
- [wiki/Home.md](wiki/Home.md)
- [wiki/Data Model.md](<wiki/Data Model.md>)
- [wiki/Change Guide.md](<wiki/Change Guide.md>)
- [wiki/Feature Map.md](<wiki/Feature Map.md>)

The most important rule: `coaches.id` is a persistent person, while `season_coaches.id` is a team in one season/division. Matches, rosters, standings, transactions, bets, and pick-ems generally use `season_coaches.id`.

## Working Practices

- Check `git status --short` before editing.
- Do not revert unrelated user changes.
- Read the files you will modify before patching.
- Prefer existing services/helpers over duplicated business logic.
- Keep changes scoped.
- Use `rg` for search.
- Avoid committing secrets, local DB files, WAL/SHM files, backups, or generated artifacts unless explicitly requested.
- For shared changes, branch from current `main`, open a pull request, merge, then deploy merged `main` to Fly.

## Verification

Preferred checks:

```bash
npx tsc --noEmit
npx eslint <changed files>
```

`npm run lint` currently reports many pre-existing unrelated errors, so targeted ESLint is usually more useful until lint config is cleaned up.

For data writes, test against a copied local `pbo.db`. Do not experiment on production.

## High-Risk Changes

Read [wiki/Data Model.md](<wiki/Data Model.md>) and [wiki/Change Guide.md](<wiki/Change Guide.md>) before changing:

- Match results.
- Rosters or transactions.
- Elo.
- Betting, kill betting, death betting.
- Pick-em rewards.
- Google Sheets sync.
- Replay parsing used by PBO match recording.
- Season/division/coach deletion or imports.
