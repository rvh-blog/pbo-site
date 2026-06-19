# Local Development Runbook

## Install

```bash
npm install
```

## Environment

Create local environment settings when needed:

```bash
cp .env.example .env.local
```

Fill only the values needed for the feature you are working on. For the default local SQLite path, `DATABASE_PATH=pbo.db` is enough.

## Run App

```bash
npm run dev
```

Default app URL:

```text
http://localhost:3000
```

If port 3000 is occupied, Next may choose another port.

## Database

Local DB default:

```text
pbo.db
```

Production uses:

```text
DATABASE_PATH=/data/pbo.db
```

For realistic development, download a fresh production DB copy using [[Database Runbook]].

## Useful Commands

```bash
npx tsc --noEmit
npx eslint <changed files>
npm run build
```

`npm run lint` currently reports pre-existing unrelated errors, so targeted ESLint is usually the practical check.

## See Also

- [[Database Runbook]]
- [[Verification Runbook]]
- [[Operations]]
