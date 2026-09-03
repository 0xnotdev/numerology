# ADR 0006: Deterministic launch reporting with optional AI

- Status: Accepted; supersedes the generative-expression portion of ADR 0002
- Date: 2026-09-03

## Context

The paid V1 product sells a personalized report containing charts, interpretations, remedies,
and a readable delivery. A model call would add a runtime dependency, make reproduction harder,
and risk exposing internal safety machinery. Report correctness depends on deterministic calculation,
versioned doctrine, bounded remedies, assembly, verification, and delivery.

## Decision

Launch reporting is deterministic end to end: input normalization, calculation, evidence resolution,
planning, writing, verification, persistence, and customer projection. The internal structured report
may retain identifiers, provenance, confidence, ranking, hashes, versions, and verifier records for
audit and fail-closed behavior. Customer delivery accepts only a strict projection that omits those
fields and renders readable text, chart values, optional traditional-practice remedies, and useful
methodology prose.

AI/LLM writing is an optional future adapter, not a launch dependency. If introduced, it must consume
already-verified evidence, preserve deterministic numbers and safety boundaries, record explicit
optional adapter metadata, and pass the same independent verifier before delivery. It may not be
required for report availability or used to silently resolve unsupported doctrine.

## Consequences

The launch path can run offline and reproduce byte-stable reports without model credentials or network
availability. Deterministic editorial copy requires versioned writer and writer-policy identifiers.
Customer DTOs need an explicit projection layer because internal evidence is intentionally richer than
what a reader needs. Report mutation is a deep/periodic gate (`pnpm report:mutation:deep`) rather than
an ordinary verify prerequisite; ordinary verify retains engine/doctrine mutation and all report tests,
coverage, fixture, E2E, and build gates.

## Migration trigger

An approved product decision and adapter design may add optional generative expression only after a
deterministic launch path exists and independent verification remains mandatory.
