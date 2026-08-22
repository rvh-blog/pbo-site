# Deploy Runbook

## Production App

Fly app:

```text
pbo-site
```

Deploy with the same-day changelog guard:

```bash
npm run deploy:fly
```

The command refuses to deploy unless the deployment commit updates
`src/data/changelog-releases.json` and it contains a valid entry dated for the
current day in `America/Los_Angeles`. Every separately deployed update must add
a new entry with a unique `sourceKey`, including multiple releases on one day.
Bundled release entries are inserted into the production changelog once during
server startup; admin-authored entries are not overwritten.

The default Fly remote build can take several minutes for this app. For a
non-interactive deployment, submit it detached and monitor the app separately:

```bash
flyctl deploy --remote-only --detach --yes
flyctl status
flyctl releases
```

The Docker context excludes local `backups/` and other development-only files.
The tracked `public/images` assets remain part of the image because the site
serves them at runtime. Team and division PNGs can be safely recompressed in
place with `npm run assets:optimize`; `npm run assets:check` enforces the image
budget without changing public URLs.

In the shared GitHub flow, deploy from merged `main`, not from an unreviewed local branch:

```bash
git checkout main
git pull
npm run deploy:fly
```

## Before Deploy

1. Check `git status --short`.
2. Run relevant verification.
3. Confirm DB migrations or manual DB changes are handled.
4. Confirm no secrets or local DB files are staged.
5. Confirm the code being deployed is the intended merged GitHub state.
6. Add that release's same-day entry to `src/data/changelog-releases.json`.

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
4. Copies Next standalone output, the self-contained bot bundle, public assets,
   the migration runner, and the startup script. It does not copy the complete
   build-time `node_modules` tree.
5. Starts `/app/start.sh`, which applies tracked startup migrations before
   launching the website and bot.

## Runtime

`fly.toml:

```text
DATABASE_PATH=/data/pbo.db
internal_port=3000
volume=pbo_data mounted at /data
minimum running machines=0 (idle autostop enabled)
HTTP health check=/api/health
```

## After Deploy

Check:

- Site loads.
- `/api/health` returns `status: ok` and Fly reports its service check passing.
- Admin route loads if auth is relevant.
- Recent changed route works.
- Bot behavior if bot code changed.
- Logs if needed.

## See Also

- [[GitHub Collaboration Runbook]]
- [[Operations]]
- [[Production Safety Runbook]]
- [[Discord Bot Workflow]]
