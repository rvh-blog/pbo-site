# Claude Instructions

This repo has a local wiki for project context. Read it before making non-trivial changes:

- [wiki/README.md](wiki/README.md)
- [wiki/Home.md](wiki/Home.md)
- [wiki/runbooks/GitHub Collaboration Runbook.md](<wiki/runbooks/GitHub Collaboration Runbook.md>)
- [wiki/Operations.md](wiki/Operations.md)
- [wiki/Data Model.md](<wiki/Data Model.md>)
- [wiki/Change Guide.md](<wiki/Change Guide.md>)
- [wiki/Feature Map.md](<wiki/Feature Map.md>)

Key mental model:

- `coaches.id` = persistent person/account/Elo/currency identity.
- `season_coaches.id` = team identity inside one season/division.

Most breakage comes from confusing those IDs or from changing a match/roster flow without updating the downstream cascade.

Before editing, check the dirty worktree and avoid reverting unrelated changes. For verification, prefer:

```bash
npx tsc --noEmit
npx eslint <changed files>
```

For shared work, use GitHub as the code source of truth: branch, pull request, merge to `main`, then deploy merged `main` to Fly. Do not commit secrets, `pbo.db`, `pbo.db-wal`, `pbo.db-shm`, backups, or generated artifacts unless explicitly requested.
