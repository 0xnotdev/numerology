# ADR 0004: Launch on one managed Mumbai data plane

- Status: Accepted
- Date: 2026-08-31

## Context

The product is India-first and lean. It needs a managed web service, worker, PostgreSQL, queue, and
object storage with minimal operations. Keeping these services in one India region reduces latency,
avoids an immediate migration, and makes data-location disclosures simpler without claiming that
every processor remains in India.

## Decision

Launch Cloud Run web and worker services, Cloud SQL for PostgreSQL 17, Cloud Tasks, and private Cloud
Storage in Google Cloud `asia-south1` (Mumbai). Begin with zero minimum Cloud Run instances and a
single-zone database only if the documented recovery objective accepts a zone outage. Keep
deployment portable through a Docker image, standard PostgreSQL, object-store and task ports, and
provider-neutral domain modules.

## Consequences

The primary data plane is in-country, but model, payment, support, and email subprocessors may not
be. The privacy notice and processor register must state actual processing locations. Cloud SQL is
the main fixed cost and single-zone launch accepts a zone-recovery window.

## Migration trigger

Enable regional Cloud SQL HA before publishing a 99.9% paid-flow availability commitment or when
recurring revenue makes a zone outage unacceptable. Re-evaluate the provider when Cloud SQL fixed
cost dominates unit economics, international field latency needs an edge split, or multi-region
recovery becomes a contractual requirement.
