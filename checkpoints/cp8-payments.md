# Checkpoint 8: ₹499 order and payment correctness

Status: ENGINEERING COMPLETE — test-mode implementation only; live acceptance remains blocked.

## Outcome

A completed report intent can create one ₹499 INR provider order. Only server-verified captured
payment state may atomically grant one entitlement, create one pending report, and append one
generation-request outbox event. Duplicate, delayed, reordered, tampered, mismatched, timed-out, or
ambiguous provider messages never double-fulfil and never tell a customer to pay again prematurely.

## Public test seams

1. Authenticated checkout creation HTTP interface.
2. Authenticated Checkout proof HTTP interface.
3. Raw Razorpay webhook HTTP interface.
4. Owner-scoped order-status HTTP interface.
5. Authenticated internal reconciliation HTTP/command interface.
6. Durable payment repository interface, observed only through its public commands and queries.
7. Customer checkout/state UI for pending, failed, expired, ambiguous, and paid states.

Tests use real PostgreSQL for durability and a fake adapter only at the external payment-provider
seam. They do not test private helpers or treat provider call counts as product behaviour.

## Fixed product and money rules

- Product: `personal-numerology-report-v1`; price snapshot: ₹499 exactly (`49900` paise), currency
  `INR`, partial payment disabled. The stored snapshot is authoritative for all later comparisons.
- Checkout is available only for an authenticated owner and their completed, unexpired intent.
- Creating the remote provider order occurs outside database locks. A durable preparation/idempotency
  record makes provider timeout retry safe; a provider order is adopted only after exact
  amount/currency/receipt validation. The bare local order UUID is the provider receipt, remaining
  within Razorpay's 40-character limit; do not prefix it.
- Browser success is proof to investigate, not proof of capture. Verify the Checkout HMAC using the
  server-stored provider order ID, then fetch provider state. Do not grant from callback fields.
- Verify Razorpay webhooks against the untouched raw bytes with HMAC-SHA256. Deduplicate by
  `X-Razorpay-Event-Id`, retain receipt/outcome evidence, and accept delivery reordering.
- Grant only a `captured` payment whose provider order, amount and currency exactly match the stored
  price snapshot. State transitions are monotonic; a later weaker/failing event cannot undo capture.
- The capture transaction inserts or confirms one payment, one pending report, one view entitlement,
  and one `report.generation.requested.v1` outbox event. Unique constraints make replay harmless.
- Provider timeouts and unverified callback-only states are `ambiguous`, never `failed`. Customer copy
  says verification is continuing and does not request another purchase.
- Reconciliation fetches authoritative provider state and runs the same capture path. CP9 owns outbox
  relay and report generation; CP8 does not execute the pending job.
- Refund requests are approval-controlled durable requests. A provider refund adapter is not invoked
  automatically and refunded state revokes the paid entitlement monotonically. The bare refund-request
  UUID is its provider receipt/idempotency key and also remains within the 40-character limit.
- No LLM or AI runtime, confidence/ranking/verification customer fields, live credentials, or live
  money are part of this checkpoint.

## Provider contract

`PaymentGateway` is the true-external seam. Its production Razorpay adapter creates an order, fetches
orders/payments and can submit an explicitly approved refund; the deterministic payment module owns
all business validation and persistence. Checkout and webhook signatures use separate secrets.
Secrets never enter logs, browser payloads (except the public key ID), database rows, or errors.

## Required contract cases

- Successful test-mode order and captured payment produce exactly one fulfilment set.
- Tampered Checkout signature and changed raw webhook bytes are rejected.
- Twenty concurrent duplicate events and repeated proofs remain exactly-once.
- `captured` before `authorized`, repeated `failed`, and late weak events preserve monotonic state.
- Wrong amount, currency, provider order, receipt, or local owner/intent never fulfils.
- Callback-only success, database failure after provider success, provider timeout, and unknown state
  remain safe and recoverable through status/reconciliation.
- Reconciliation closes a missed-webhook capture without duplicating fulfilment.
- Refund request/replay is idempotent; execution requires separate approval and exact provider state.

## Completion and launch boundary

Engineering completion requires the contract suites, migration/catalog checks, strict type checks,
full `pnpm verify`, Graphify refresh, operator documentation, and independent Sol review with all
actionable findings closed. Test-mode provider acceptance requires merchant test credentials and an
externally reachable webhook; without credentials the adapter is verified against its official HTTP
contract and a local boundary fake.

Live launch remains blocked on Razorpay merchant/category approval, live key and webhook-secret
provisioning, capture/dashboard configuration, webhook reachability, fees/settlement review, approved
refund/privacy/terms/contact pages, and CA/counsel confirmation of tax/GST and invoice wording. The UI
may say only `Total ₹499`; it must not invent tax-inclusive or GST claims before that review.
