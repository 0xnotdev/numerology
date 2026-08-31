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

Checkpoints 1 and 2 are complete: PostgreSQL persistence protects resumable intent/snapshot data, and
every V1 calculation is pure profile-aware code with exact traces, canonical hashes, and handbook
fixtures. The full evidence and the one host-level Docker daemon exception are recorded in `progress.md`.

The delivered Checkpoint 3 slice is the pure doctrine compiler/registry in `packages/doctrine`: strict
versioned rule/source/action schemas, an allowlisted condition interpreter, compiler integrity checks,
canonical indexed releases, and fail-closed evidence resolution against validated calculation bundles.
Report planning remains explicitly deferred.
