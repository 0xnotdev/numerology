# ADR 0003: PostgreSQL is the system of record; Cloud Tasks is the launch queue

- Status: Accepted
- Date: 2026-08-31

## Context

Paid report generation needs transactions, idempotency, retries, and operational inspection. A
separate cache or broker would add cost and failure modes before load justifies it.

## Decision

Use Cloud SQL for PostgreSQL 17 for application state and an application outbox. A relay creates a
deterministically named Cloud Tasks job only after commit; the private worker receives only an
opaque report ID. Store large PDFs in object storage, not PostgreSQL.

## Consequences

The database owns business state while the managed queue owns delivery, retry, and rate control.
The outbox closes the payment-commit/enqueue gap; task handlers must still be idempotent. Worker
load is isolated through connection limits, short transactions, and separate compute.

## Migration trigger

Adopt a streaming broker only if ordered event fan-out or measured queue throughput exceeds Cloud
Tasks' HTTP-task model. Adopt a PostgreSQL-native queue only if provider portability becomes more
valuable than the managed delivery boundary.
