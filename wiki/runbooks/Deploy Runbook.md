# Deploy Runbook

## Production App

Fly app:

```text
pbo-site
```

Deploy:

```bash
fly deploy
```

The default Fly remote build can take several minutes for this app. For a
non-interactive deployment, submit it detached and monitor the app separately:

```bash
flyctl deploy --remote-only --detach --yes
flyctl status
flyctl releases
```

The Docker context excludes local `backups/` and other development-only files.
The tracked `public/images` assets remain part of the image because the site
serves them at runtime.

In the shared GitHub flow, deploy from merged `main`, not from an unreviewed local branch:

```bash
git checkout main
git pull
fly deploy
```

## Before Deploy

1. Check `git status --short`.
2. Run relevant verification.
3. Confirm DB migrations or manual DB changes are handled.
4. Confirm no secrets or local DB files are staged.
5. Confirm the code being deployed is the intended merged GitHub state.

Recommended:

```bash
npx tsc --noEmit
npx eslint <changed files>
```

For broad changes:

```bash
npm run build
```

## What Docker Builds

`Dockerfile:

1. Installs dependencies with `npm ci`.
2. Runs `npm run build`.
3. Runs `node scripts/build-bot.js`.
4. Copies Next standalone output, bot bundle, node_modules, and startup script.
5. Starts `/app/start.sh`.

## Runtime

`fly.toml:

```text
DATABASE_PATH=/data/pbo.db
internal_port=3000
volume=pbo_data mounted at /data
```

## After Deploy

Check:

- Site loads.
- Admin route loads if auth is relevant.
- Recent changed route works.
- Bot behavior if bot code changed.
- Logs if needed.

## See Also

- [[GitHub Collaboration Runbook]]
- [[Operations]]
- [[Production Safety Runbook]]
- [[Discord Bot Workflow]]
