# Current checkpoint

Checkpoint 6 private report/account implementation and local acceptance are complete. The completed
scope is in [cp6-private-access.md](cp6-private-access.md). The next checkpoint needs its own compact
acceptance brief before implementation; do not infer payment or fulfillment behavior from CP6 stubs.

The canonical checkout is `D:/numerology app/platform`, branch `main`, tracking `github/main`.
The launch product calculates charts and writes reports deterministically. Customer delivery omits
confidence, ranking and verification internals.

Checkpoint 6 adds session-backed account/report routes, same-query owner/order/entitlement checks,
customer-only report delivery, recent-auth/CSRF enforcement, all-device revocation, atomic audited
idempotent lifecycle receipts, and an explicitly unavailable signed-PDF endpoint. Migrations through
0012 are required. Full `pnpm verify` passed (489 tests plus tooling); Graphify scope/query checks pass.
Live email, production credentials, request fulfillment, payment and PDF storage remain outside this
local acceptance. Independent Sol validation signed off the final diff and reran 20 focused tests.

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
