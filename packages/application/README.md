# Application package

Checkpoint 1 application policies that do not depend on HTTP or PostgreSQL live here.

## Public seams

- `Clock` and `IdGenerator` keep time and random identifiers injectable.
- `TransactionRunner` expresses an atomic application boundary without exposing a database client.
- `FieldProtector` provides purpose-bound encryption, reveal, and keyed lookup operations.
- `ReportIntentRepository` owns draft creation/resume, optimistic updates, immutable completion, and
  expiry transitions.
- `createExpireReportIntents` is the bounded expiry-cleanup command.

`LocalEnvelopeFieldProtector` is a development/test adapter. It uses one fresh data-encryption key per
value, AES-256-GCM authentication, a separately keyed lookup HMAC, and a versioned envelope. Construct
it from environment variables with `createLocalFieldProtectorFromEnvironment`. Production KMS support
will implement the same `FieldProtector` port in its checkpoint.

Run `pnpm --filter @numerology/application test` for behavior tests.
