# Database package

Checkpoint 1 PostgreSQL 17 persistence. The package contains the reviewed Drizzle schema, committed
SQL migration, capped pool, transaction runner, readiness probe, optimistic report-intent repository,
catalog verifier, and synthetic fixtures.

## Migration rules

- Generate candidate SQL with `pnpm --filter @numerology/database db:generate` and review it.
- Apply committed migrations with `pnpm db:migrate`.
- Run `pnpm db:check` to detect migration-journal drift.
- Never use `drizzle-kit push` in CI or an application process.
- Do not regenerate `0000_checkpoint_1.sql`; it contains reviewed immutability triggers in addition to
  generated DDL.

Integration tests accept only a local connection string whose database name is exactly
`numerology_test` before they reset `public`. Run them with
`pnpm --filter @numerology/database test`.
