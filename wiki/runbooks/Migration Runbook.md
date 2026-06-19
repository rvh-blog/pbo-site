# Migration Runbook

## Schema Source

- `src/lib/schema.ts`
- `drizzle.config.ts`

Drizzle points at local:

```text
./pbo.db
```

## Generate Migration

```bash
npm run db:generate
```

Underlying:

```bash
drizzle-kit generate
```

## Push Schema Locally

```bash
npm run db:push
```

Underlying:

```bash
drizzle-kit push
```

## Seed

```bash
npm run db:seed
```

Underlying:

```bash
npx tsx src/lib/seed.ts
```

## Manual SQL Migration

There is a standalone migration:

```bash
sqlite3 pbo.db < migrations/add-division-sheet-sync.sql
```

## Checklist

- Update `src/lib/schema.ts`.
- Generate or write migration.
- Apply/test locally.
- Update API routes/admin pages/import scripts for new required fields.
- Update wiki if the data relationship changes.
- Back up production DB before applying production schema changes.

## See Also

- [[Core League Entities]]
- [[Data Model]]
- [[Database Runbook]]
