# Numerology Platform Context

## Purpose

Sell one ₹499 personalized numerology report to India-first customers. The product makes
tradition boundaries visible, keeps all arithmetic deterministic, and uses language models only
to plan and express conclusions that are already supported by calculated facts and a versioned
doctrine registry.

## Ubiquitous language

- **Subject**: the person whose details are analyzed; not necessarily the purchaser.
- **Report intent**: a validated, unpaid request and its immutable intake snapshot.
- **Calculation bundle**: deterministic outputs and traces for one engine/profile version.
- **Evidence bundle**: versioned doctrine rules retrieved for calculated facts.
- **Report plan**: ranked claims and section assignments, with citations to fact and rule IDs.
- **Structured report**: locale-neutral semantic claims plus localized prose and display data.
- **Entitlement**: permission to view or download a paid report.
- **Profile**: a complete, internally consistent formula policy for one numerology tradition.

## Invariants

1. Language models never calculate or silently change a number.
2. Incompatible traditions are compared; their outputs are never averaged.
3. A report can be reproduced from immutable input, engine, doctrine, prompt, model, and locale
   versions.
4. Browser redirects do not grant payment entitlements; verified server events do.
5. Customer claims are framed as reflective guidance, never medical, legal, financial, or
   deterministic life advice.

## Current checkpoint

Checkpoint 1 is complete. The repository now persists encrypted resumable report intents and immutable
completion snapshots on PostgreSQL 17, with optimistic concurrency, append-only consent/audit evidence,
expiry cleanup, bounded readiness, guarded synthetic fixtures, and restore validation. The full evidence
and the one host-level Docker daemon exception are recorded in `progress.md`.

Checkpoint 2 builds every V1 calculation as pure profile-aware code with exact traces, canonical hashes,
golden handbook fixtures, property/mutation coverage, and no I/O or model dependency.
