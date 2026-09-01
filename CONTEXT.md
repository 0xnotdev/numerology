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

The delivered Checkpoint 3 slice is the doctrine compiler/registry in `packages/doctrine`: it compiles
canonical `data/rule.schema.json`, validates review/content hashes and release references, interprets a
closed condition language, emits deterministic indexed releases, and resolves validated calculation
bundles through the immutable `ResolvedEvidenceBundle` contract. Reporting must consume that export
directly; report planning remains explicitly deferred.
