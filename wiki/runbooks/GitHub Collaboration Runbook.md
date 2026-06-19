# GitHub Collaboration Runbook

Parent index: [[Home|PBO Site Wiki]]

GitHub is the shared source of truth for code. Fly is the production hosting target. Fly does not push code back to GitHub.

```text
GitHub = source code, history, branches, reviews
Fly = running production app
Fly volume = production SQLite database
```

## Normal Flow

Use this flow for ordinary code changes:

1. Pull the latest `main` from GitHub.
2. Create a short-lived branch for the change.
3. Make the code/docs change locally.
4. Run relevant verification.
5. Commit only intentional source/docs/config changes.
6. Push the branch to GitHub.
7. Open a pull request.
8. Review the diff, test notes, and risk areas.
9. Merge to `main`.
10. Deploy the merged `main` to Fly.

Deployment can stay manual with `fly deploy`, or later be automated from GitHub Actions. Either way, GitHub should remain the code source of truth.

## What Belongs In GitHub

Commit:

- Application source in `src`.
- Reusable scripts in `scripts`.
- Drizzle schema, migration files, and migration metadata.
- Public assets that the app needs at runtime.
- Docs, wiki notes, `AGENTS.md`, and `CLAUDE.md`.
- Deployment config such as `Dockerfile`, `.dockerignore`, and `fly.toml`.
- Package manifests and lockfiles.
- Safe templates such as `.env.example`.

Do not commit:

- `pbo.db`, `pbo.db-wal`, `pbo.db-shm`, or any other SQLite DB copy.
- Production DB backups.
- `.env.local` or any `.env*` file with secrets.
- `.secrets` or personal tool state.
- Generated build output such as `.next`, `dist`, `out`, or coverage.
- Large generated caches unless explicitly needed by production.

## Current Cleanup Needed

At the time this wiki was written, these DB files were already tracked by Git:

```text
pbo.db
local.db
sqlite.db
data/pbo.db
```

`.gitignore` prevents new DB files from being added, but it does not untrack files that are already in Git. Before sharing the repo broadly, remove these from version control while keeping the local files:

```bash
git rm --cached pbo.db local.db sqlite.db data/pbo.db
git commit -m "Remove local database files from version control"
```

If the repo has ever been pushed with real production data or secrets, treat that as leaked data. Rotate any exposed secrets and consider whether Git history needs to be rewritten before inviting more people.

## Branch And PR Expectations

Keep branches small and named after the change, for example:

```text
feature/public-replay-analyzer
fix/time-synced-roster-bets
docs/github-collaboration
```

Pull requests should include:

- What changed.
- What was tested.
- Any data/model risk.
- Whether deployment or DB work is required.

High-risk PRs should point reviewers to the matching wiki page:

- Match result changes: [[Match Results Workflow]]
- Roster and transaction changes: [[Rosters And Transactions Workflow]]
- Elo changes: [[Elo Workflow]]
- Sheets sync changes: [[Sheets Sync Workflow]]
- Replay parser changes: [[Replay Analysis Workflow]]

## Before Pushing

Check the worktree:

```bash
git status --short
```

Check that no local DBs or secrets are staged:

```bash
git diff --cached --name-only
```

New collaborators can copy `.env.example` to `.env.local` and fill in only the values they need locally. Never put real secrets in `.env.example`.

Run targeted verification:

```bash
npx tsc --noEmit
npx eslint src/path/to/changed-file.ts src/path/to/changed-file.tsx
```

For broader app changes:

```bash
npm run build
```

## Deploying After Merge

Deploy from a clean local checkout of merged `main`:

```bash
git checkout main
git pull
fly deploy
```

Before deploying, read [[Deploy Runbook]] and confirm:

- The diff being deployed has landed in GitHub.
- Verification passed or the remaining risk is understood.
- Any DB migration/manual DB step has already been handled.
- No local-only files are part of the deploy context.

## Production Data Boundary

GitHub should never be the source of production data. The production DB lives on the Fly volume at `/data/pbo.db`.

For DB download/upload instructions, use [[Database Runbook]]. For destructive production actions, read [[Production Safety Runbook]] first.
