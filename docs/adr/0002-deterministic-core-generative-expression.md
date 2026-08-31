# ADR 0002: Deterministic core, generative expression

- Status: Accepted
- Date: 2026-08-31

## Context

Numerology schools disagree, while paid reports must be numerically reproducible and auditable.

## Decision

Pure functions calculate typed facts under an explicit profile. Versioned doctrine rules interpret
those facts. Language models may rank supported findings and realize prose, but every output claim
must reference fact and rule identifiers. Verification rejects unsupported numbers, mixed schools,
unsafe claims, and incomplete sections.

## Consequences

The pipeline has more explicit contracts than a single prompt, but failures are explainable and
reports remain reproducible across model upgrades.

## Migration trigger

None. This is a product trust invariant, not an implementation preference.
