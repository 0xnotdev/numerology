# Numerology Platform Context

## Purpose

Sell one ₹499 personalized numerology report to India-first customers. The product makes
tradition boundaries visible, keeps all arithmetic, doctrine lookup, remedies, report assembly,
verification, and delivery deterministic. AI/LLM expression is an optional future adapter and is
never a launch dependency.

## Ubiquitous language

- **Subject**: the person whose details are analyzed; not necessarily the purchaser.
- **Report intent**: a validated, unpaid request and its immutable intake snapshot.
- **Calculation bundle**: deterministic outputs and traces for one engine/profile version.
- **Evidence bundle**: versioned doctrine rules retrieved for calculated facts.
- **Report plan**: ranked claims and section assignments, with citations to fact and rule IDs.
- **Structured report**: locale-neutral semantic claims plus localized prose and display data.
- **Customer delivery projection**: a strict, readable DTO containing only customer-safe report text,
  chart values, remedies, and methodology; it excludes internal identifiers, confidence, ranking,
  provenance, versions, hashes, and verifier records.
- **Traditional practice / remedy**: an optional low-risk symbolic or practical suggestion for
  reflection; never required, fear-based, guaranteed, medical, legal, financial, or an upsell dependency.
- **Entitlement**: permission to view or download a paid report.
- **Profile**: a complete, internally consistent formula policy for one numerology tradition.

## Invariants

1. Language models never calculate or silently change a number.
2. Incompatible traditions are compared; their outputs are never averaged.
3. A report can be reproduced from immutable input, engine, doctrine, deterministic writer policy,
   and locale versions. Optional generative metadata is absent unless a separately approved adapter
   is used and never changes calculated facts or verification.
4. Browser redirects do not grant payment entitlements; verified server events do.
5. Customer claims are framed as reflective guidance, never medical, legal, financial, or
   deterministic life advice.

## Current checkpoint

Checkpoints 1–3 are complete: PostgreSQL persistence protects resumable intent/snapshot data, every V1
calculation is pure profile-aware code with exact traces and canonical hashes, and doctrine resolves
through an immutable `ResolvedEvidenceBundle` consumed by the deterministic planner.

Checkpoint 4 productionizes the report boundary in `packages/report`: a structured, internally
provenanced report; a 7,500–10,000-word `en-IN` deterministic fallback; fail-closed numeric, source,
profile, contradiction, safety, similarity, PII, length, repetition, and content gates; encrypted
report snapshot persistence; an executable 60-subject golden matrix; and a customer-safe synthetic
web reader. The fallback has no model, network, database, or customer-data dependency. Full quantitative
evidence, including the Docker host exception, is recorded in `progress.md`.
