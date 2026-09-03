# Application package

Framework-independent application policies live here. The package owns ports for time, IDs,
transactions, field protection, report-intent lifecycle, and the Checkpoint 4 report-generation
persistence seam.

## Public seams

- `Clock` and `IdGenerator` keep time and random identifiers injectable.
- `TransactionRunner` expresses an atomic application boundary without exposing a database client.
- `FieldProtector` provides purpose-bound encryption, reveal, and keyed lookup operations.
- `ReportIntentRepository` owns draft creation/resume, optimistic updates, immutable completion, and
  expiry transitions.
- `ReportGenerationRepository` accepts encrypted input/calculation/evidence/plan/report snapshots,
  version vectors, hashes, verification, and opaque IDs, then exposes only the ready projection.
- `createExpireReportIntents` is the bounded expiry-cleanup command.

`LocalEnvelopeFieldProtector` is a development/test adapter. It uses one fresh data-encryption key per
value, AES-256-GCM authentication, a separately keyed lookup HMAC, and an explicit `NFP1` serialized
versioned envelope. Database adapters must call `serializeProtectedField`, which validates the serialized
format and binds persisted key metadata to the authenticated bytes. Construct
it from environment variables with `createLocalFieldProtectorFromEnvironment`. Production KMS support
will implement the same `FieldProtector` port in its checkpoint.

Run `pnpm --filter @numerology/application test` for behavior tests.
