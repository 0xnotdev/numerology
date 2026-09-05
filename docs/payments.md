# ₹499 payment operations

Checkpoint 8 integrates Razorpay Standard Checkout in test mode. PostgreSQL remains the authority
for orders, payment events, fulfilment and refund approvals. A browser callback can speed up status
checking, but it cannot mark an order paid.

## Money and state contract

- Product version: `personal-numerology-report-v1`
- Amount: `49900` paise
- Currency: `INR`
- Partial payments: disabled
- Provider order receipt: the bare local order UUID (36 characters)
- Refund receipt: the bare refund-request UUID (36 characters)

Only an authoritative `captured` provider payment with the exact stored provider order, amount and
currency creates the fulfilment set. That transaction contains one pending report, one `view`
entitlement and one `report.generation.requested.v1` outbox row. CP9 relays and executes the outbox;
CP8 does not generate a report.

Capture and refund finality are monotonic. `ambiguous` means the provider outcome is temporarily unknown;
it is not a failure and must never prompt an immediate second payment. Reconciliation uses the stored
provider order or the durable receipt to recover a lost create-order response and then fetches all
payments for that order.

Only the transaction that creates a local order may issue the remote order-creation request. Concurrent
requests and retries never create a second remote order. A receipt lookup recovers a lost response.
A verified `created` provider order with **zero payments**, no local payment evidence, and an unexpired
intent can safely resume the same checkout. Attempted, unknown and merely authorized payments remain
ambiguous; delayed failures cannot clear uncertainty. Existing checkout is revalidated remotely before
reopening. Expired unpaid intents cannot reopen checkout, but late captures and paid/refund history
remain recoverable. If the original process died before any provider order existed, do not manufacture
a replacement: an operator must investigate the receipt and in-flight request before any future recovery
policy authorizes creation.

## HTTP interfaces

- `POST /api/v1/report-intents/:intentId/checkout` — authenticated owner, CSRF and idempotency key;
  prepares/adopts a provider order and returns only the public key and exact checkout projection.
- `POST /api/v1/orders/:orderId/proof` — authenticated owner, CSRF and idempotency key; verifies the
  Checkout HMAC against the server-stored provider order, fetches authoritative provider state, and
  returns the customer order projection.
- `GET /api/v1/orders/:orderId` — authenticated owner-scoped status; unknown and wrong-owner IDs are
  indistinguishable.
- `POST /api/webhooks/razorpay` — verifies `X-Razorpay-Signature` over untouched raw bytes, deduplicates
  `X-Razorpay-Event-Id`, and accepts out-of-order delivery. It does not persist the raw PII-bearing
  payload.
- `POST /api/internal/payments/reconcile` — authenticated operator command for bounded recovery. It
  is not public customer traffic.
- `POST /api/v1/orders/:orderId/refund` — owner/session/CSRF plus UUID idempotency key and empty JSON;
  records the single full-refund request for the order, without approval or provider execution.
- `POST /api/internal/payments/refunds` — bearer-protected operator command. `action: "approve"`
  requires `refundRequestId` and an existing operator `approverId`; `action: "execute"` takes only
  `refundRequestId`. Execution cannot self-approve. The operator bearer is privileged and must never
  be exposed to the browser or customers. Restrict these routes at the deployment ingress too.

All responses are `no-store`; private routes are `noindex` and use no-referrer policy. Logs and
problem responses must not contain Checkout proofs, webhook bodies, provider credentials, personal
details, or provider error bodies.

## Local and test-mode setup

1. Apply all database migrations through `0014` to PostgreSQL 17 and run the CP8 schema verifier.
2. Supply a Razorpay test key ID, its key secret, and a separately generated test webhook secret via
   the runtime environment. Never commit them; never reuse the API key secret as the webhook secret.
3. Configure test-mode webhooks for `payment.authorized`, `payment.captured` and `payment.failed`.
4. Use an externally reachable HTTPS staging webhook for provider acceptance. Local contract tests
   use a fake only at the external HTTP seam and never move money.
5. Confirm Dashboard payment capture is configured for automatic capture, then complete Razorpay's
   documented test flow. A merely `authorized` payment is not fulfilment.
6. Configure the existing customer/session runtime first. Then explicitly set
   `PAYMENTS_RUNTIME_ENABLED=true`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`,
   `RAZORPAY_WEBHOOK_SECRET` and a separate 32+ character `PAYMENTS_INTERNAL_BEARER_SECRET`.
   Incomplete enabled configuration aborts startup; disabled routes fail closed with 503.
   Payment HTTP applies durable per-principal/operator budgets; enforce ingress body/time/rate limits
   for the public webhook as well. The handler caps raw webhook bodies at 64 KiB, customer/operator
   JSON at 8 KiB, and provider responses at 128 KiB. Provider calls have a five-second default timeout.

The implementation intentionally rejects live keys during CP8. Do not weaken that guard to test
production traffic.

## Reconciliation and incidents

Reconcile when Checkout proof arrived but no capture webhook is visible, provider order creation
timed out, a webhook was rejected during a database outage, or an order remains ambiguous. Repeated
reconciliation is safe: unique database constraints converge all verified evidence on the same
fulfilment set.

Send `POST /api/internal/payments/reconcile` with the operator bearer, JSON content type and
`{"orderId":"<local-order-uuid>"}`. Each request processes one order. A 503 is retryable; a financial
mismatch requires investigation, not another purchase. The customer status endpoint only reads durable
state. Schedule reconciliation and alert on unresolved age when CP9's worker/operations runtime lands;
CP8 supplies the bounded command, not a hidden background loop.

If provider amount, currency, order ID or receipt differs from the stored snapshot, stop automated
processing and investigate. Do not edit financial rows by hand and do not tell the customer to pay
again. Restore provider/database availability and rerun the same reconciliation command.

Refund requests are durable but require a separate approval before the adapter can submit them.
Approval and execution are distinct operations. Provider confirmation moves an order to refunded and
revokes its entitlement. Timeout retries use the same request body, UUID receipt and
`X-Refund-Idempotency` header. Once a provider refund ID is persisted as `submitted`, execution fetches
that refund ID to observe asynchronous completion instead of submitting a new refund. Exact amount,
currency, payment ID, receipt and refund ID are checked before confirmation. Pending/unavailable or
mismatched responses do not revoke access. Request, approval and outcome transitions have append-only,
non-PII audit evidence; the financial identities and payment event receipts cannot be rewritten.

## Live launch gates

Live payment remains prohibited until every item below has human evidence:

- Razorpay merchant/KYC and business-category approval, live website allowlisting and live keys.
- Live webhook secret, reachable HTTPS endpoint, subscribed events and observed delivery/retry.
- Automatic-capture configuration plus fees, settlement timing and reconciliation ownership.
- Reviewed terms, privacy, contact and refund/cancellation pages linked from checkout.
- CA/counsel confirmation of GST/tax treatment, invoice fields and whether any tax-inclusive wording
  is lawful. Until then the interface states only `Total ₹499`.
- Database restore drill, alerting, operator access controls, test payment, refund, duplicate webhook,
  missed-webhook and provider-timeout acceptance.
- Checkpoint 9 worker and the later release gates; a captured payment must not be accepted when the
  purchased report cannot be produced and delivered.

Provider references: [Standard Checkout](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/),
[webhook validation](https://razorpay.com/docs/webhooks/validate-test/),
[API authentication](https://razorpay.com/docs/api/authentication/), and
[payments for an order](https://razorpay.com/docs/api/orders/fetch-payments/),
[idempotent refunds](https://razorpay.com/docs/api/refunds/normal-refunds-idempotent/), and
[refund status fetch](https://razorpay.com/docs/api/refunds/fetch-with-id/).
