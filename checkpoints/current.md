# Current checkpoint

Checkpoint 5 implementation and local acceptance are complete. Start the next checkpoint only after
reading [cp5-intake.md](cp5-intake.md) and the release dependencies below.

The canonical checkout is `D:/numerology app/platform`, branch `main`, tracking `github/main`.
The launch product calculates charts and writes reports deterministically. Customer delivery omits
confidence, ranking and verification internals.

Implemented: the authenticated create/save/resume/complete/preview UI and API; encrypted drafts and
completion-time subject provisioning; immutable deterministic snapshots; India civil dates; separate
per-name Y policy; durable consent; shared PostgreSQL limits; logout; KMS/SES production adapters;
explicit startup and bounded authenticated maintenance. Missing or unreviewed runtime configuration
fails closed before the form collects personal details. Hindi/Odia submission remains gated pending
reviewed full privacy translations.

Email magic-link sign-in is implemented: request/confirmation pages, POST endpoints, atomic account
and session issuance, browser binding, durable email limits, cleanup and SES transport. Runtime
activation remains fail-closed; consult `docs/authentication.md` for its deployment prerequisites.

Release dependencies: supply the reviewed live controller/contact, production PostgreSQL and AWS KMS
keys, verified SES sender, trusted-edge client identity header and maintenance secret; apply migrations;
schedule the maintenance endpoint; and run live browser/email acceptance. These are deployment inputs,
not local code substitutes. Until then `CUSTOMER_RUNTIME_ENABLED` stays false and endpoints fail closed.

Development: one contract suite per slice; run affected tests/typecheck, then `pnpm verify:fast` at
handoff. Checkpoint/CI gate: `pnpm verify` (requires local PostgreSQL `numerology_test`).
Use Graphify for structural queries and `pnpm code:query Name` for exact signatures; see `AGENTS.md`.
