# Numerology Platform

Production-oriented implementation of the ₹499 personalized numerology report. Checkpoint 1 adds the
first persistence boundary: resumable report intents, immutable completion snapshots, field-level
protection, optimistic concurrency, expiry cleanup, and independently safe liveness/readiness probes.
Payments, report generation, and production cloud resources remain out of scope.

## Prerequisites

- Node.js 24 LTS or newer
- pnpm 11.19.0 (Corepack recommended)
- PostgreSQL 17, normally through Docker Desktop

## Run locally

```powershell
Copy-Item .env.example .env.local
pnpm install
docker compose up -d postgres
pnpm db:migrate
pnpm dev
```

On a pre-existing Compose volume, create the guarded integration-test database idempotently:

```powershell
Get-Content infra/local/postgres/init/01-create-test-database.sql | docker compose exec -T postgres psql -U numerology -d postgres
```

Open `http://localhost:3000`. Runtime checks are deliberately separate:

- `GET /api/health/live` checks the web process only.
- `GET /api/health/ready` checks configuration and PostgreSQL, returning only `ok` or `unavailable`.
- `/dev/readiness` is a human-readable fixture available only in development/test.

The checked-in keys in `.env.example` are public local fixtures. Generate distinct secrets for every
non-local environment; production KMS integration arrives in its planned checkpoint.

## Verify Checkpoint 1

Start PostgreSQL, then run:

```powershell
pnpm verify
docker build -t numerology-platform:checkpoint-1 .
```

`pnpm verify` runs Biome, committed-migration drift checks, strict type checks, unit/integration tests
against `numerology_test`, and a production Next.js build. Database tests refuse to reset anything
except a local database literally named `numerology_test`.

The container build runs `verify:container`, which omits only database integration tests because image
builds have no database sidecar. CI runs the full `verify` gate against its PostgreSQL 17 service before
an image is accepted.

Logical recovery is documented in
[`docs/runbooks/postgres-restore.md`](docs/runbooks/postgres-restore.md). The complete evidence and
decision ledger is [`progress.md`](progress.md).

## Repository boundaries

- `apps/web`: Next.js delivery layer; no numerology arithmetic or SQL belongs here.
- `packages/application`: use-case ports, local field protection, intent policies, time, and IDs.
- `packages/database`: PostgreSQL 17 schema, reviewed migration, adapters, integration harness.
- `packages/numerology`: pure deterministic domain functions and tests.
- `packages/contracts`: runtime-validated cross-boundary configuration/contracts.
- `docs/adr`: decisions whose rationale and migration triggers must survive implementation.

The launch data plane remains Google Cloud Mumbai (`asia-south1`). Private Cloud SQL, Cloud Tasks,
Cloud Storage, KMS, the web service, and report worker are provisioned only in their scheduled
infrastructure checkpoint.
