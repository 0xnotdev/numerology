# Current checkpoint

Checkpoint 8 payment correctness is engineering-complete in test mode; start with
[cp8-payments.md](cp8-payments.md). Live payment remains prohibited pending the named provider,
policy, tax, operations and delivery gates. The next engineering checkpoint is CP9 outbox relay and
deterministic report generation.
Checkpoint 7's deterministic quality tooling is engineering-complete, while the evaluated fallback
release remains correctly blocked and is not approved for sale. Worker delivery remains CP9.
Checkpoint 6 is complete; its scope remains in [cp6-private-access.md](cp6-private-access.md).

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

Checkpoint 7 adds the public synthetic `quality` and `release-decision` operator seams, exact artifact
and version binding, native-review packet/rubric validation, adversarial-outcome classification and
fresh-replay promotion/rollback policy. The real English assessment is 12/20 accepted (7 ordinary
verified and 5 meaningful adversarial rejections); eight ordinary reports fail claim cardinality.
Hindi/Odia remain unsupported. Native review is missing, and corpus-pairwise overlap/glossary metrics
remain explicitly unassessed blockers. These are content/release dependencies, not hidden approvals.

Final CP7 engineering evidence: 178 report tests; 98.04% lines and 95.05% branches; full `pnpm verify`
passed 530 package/database tests plus the tooling test and production build. Independent Sol review
passed 64 focused tests with no remaining actionable finding. Graphify passes at 1,598 extracted
nodes and 4,834 edges. No LLM, model credentials, customer route, schema or cloud resource was added.

Checkpoint 8 is a completed test-mode ₹499 Razorpay slice. Its public seams are authenticated checkout creation
and proof, raw webhook processing, owner-scoped status, operator reconciliation, durable repository
behaviour, and the customer checkout states. Only exact server-confirmed capture may atomically create
one entitlement, one pending report and one outbox request; browser success never grants access.
Live merchant approval, credentials, tax/invoice wording, policy pages, fees and settlement remain
deployment gates. CP9—not CP8—executes generation work. Migrations through `0014` are required.
Completion evidence: full `pnpm verify` passed 610 package/database tests plus tooling and the
production build; Graphify passes at 1,789 nodes and 5,200 edges. Independent Sol review drove and
rechecked ambiguity, expiry, refund and migration safeguards; final sign-off is recorded in progress.
