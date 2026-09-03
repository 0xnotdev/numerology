# ADR 0005: Versioned PostgreSQL persistence and purpose-bound field protection

- Status: Accepted
- Date: 2026-08-31

## Context

Checkpoint 1 must persist resumable report intents and immutable intake snapshots without exposing
names, dates of birth, emails, or draft answers as plaintext. The application will run on autoscaling
Cloud Run instances against a small Cloud SQL PostgreSQL 17 database, so migrations, connection use,
transactions, optimistic updates, and future key rotation must be explicit from the first schema.

## Decision

Use code-first Drizzle schemas with generated, reviewed SQL migrations committed to the repository.
Apply migrations with the runtime migrator and record them in `public.schema_migrations`; never use
`drizzle-kit push` outside disposable exploration. The initial migration creates only the Checkpoint 1
tables and constraints. A database trigger makes a completed report-intent snapshot write-once.

Use node-postgres with one process-level pool, a default maximum of five clients, a two-second connect
timeout, and explicit shutdown. A transaction runner checks out one client and uses that same client
for `BEGIN`, every callback query, `COMMIT`, and `ROLLBACK`. Repositories never start hidden
transactions.

The application exposes a `FieldProtector` port. The local adapter mirrors production envelope
semantics:

1. Generate a fresh 256-bit data-encryption key and 96-bit IV for each protected value.
2. Encrypt the value using AES-256-GCM with a 128-bit authentication tag.
3. Wrap the data key with a separately configured local key-encryption key using AES-256-GCM.
4. Authenticate the envelope version, key identifier, and field purpose as additional data.
5. Store a versioned UTF-8 JSON envelope inside an explicit `NFP1` serialized field format in PostgreSQL
`bytea`. The serialized header carries the format version, key identifier length/value, and key version;
application/database boundaries validate those fields before persistence, and the authenticated inner
JSON envelope repeats them for AAD/decryption checks.

Equality lookup uses HMAC-SHA-256 with a different key and an explicit purpose/version prefix. It is
not derived from ciphertext or the encryption key. Wrong keys, purposes, versions, tags, or malformed
envelopes fail closed with one non-sensitive protection error.

## Consequences

Migrations remain ordinary, reviewable SQL and schema history is reproducible. Pool capacity is small
enough to leave headroom while the service scales; it must be re-budgeted with Cloud Run maximum
instances before production. Ciphertext grows because each value carries a wrapped key and metadata,
but values can be rewrapped or re-encrypted by key identifier without changing repository contracts.
The local adapter is development/test infrastructure only; a Cloud KMS adapter must preserve the same
port and envelope-version discipline in the infrastructure checkpoint.

## Migration trigger

Change the envelope/serialization version only for an authenticated format or algorithm change, with
dual-read and tested rotation. The application `ProtectedField` must be serialized through
`serializeProtectedField` before a database adapter writes it; key ID/version metadata is never accepted
as an independent authority. Change pool limits only after calculating the total across maximum web/worker
instances and keeping operational headroom. Never edit an applied migration; use expand/contract SQL.
