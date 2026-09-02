# Database package

PostgreSQL 17 persistence for the report-intent aggregate and Checkpoint 4's synthetic ready-report
fixture. Drizzle schema and reviewed SQL migrations are kept together; report snapshots are encrypted
`bytea` values while hashes, version vectors, verification JSON, and lifecycle timestamps remain
queryable metadata.

## Checkpoint 4 persistence

`orders` is deliberately fixture-only and non-payable in this checkpoint. A ready fixture transaction
creates the order, immutable report generation snapshots, an entitlement, and a successful append-only
job attempt. `createReportGenerationRepository` exposes only the ready projection to callers; snapshot
columns are protected by a database trigger and corrected output must use a new report version.

`seedCheckpointFourReadyReportFixture` is available only to explicit development/test environments and
rejects production. It uses the shared application field protector for every private snapshot. The
schema verifier checks both the Checkpoint 1 and Checkpoint 4 table, constraint, index, and trigger
contracts.

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
