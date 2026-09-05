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
- **Order**: one customer's immutable product-and-price commitment for a completed report intent.
  It is not evidence that money was received. _Avoid_: transaction, purchase.
- **Payment**: provider-observed money movement for an order, classified from verified server state.
  _Avoid_: checkout result, browser success.
- **Captured payment**: a payment the provider confirms as captured with the exact order, amount, and
  currency expected by the platform; this is the only paid state that can grant fulfilment.
- **Ambiguous payment**: an order whose authoritative payment outcome is temporarily unknown, such as
  after a timeout or a verified callback before provider capture. _Avoid_: failed payment.
- **Payment event**: an authenticated, deduplicated provider notification retained as processing
  evidence; delivery order is not business-state order. _Avoid_: payment.
- **Fulfilment set**: the entitlement, pending report, and generation-request outbox event created
  atomically for one captured order.
- **Refund request**: an approval-controlled intent to reverse a captured payment; it is not a refund
  until the provider confirms the reversal. _Avoid_: refund.

## Invariants

1. Language models never calculate or silently change a number.
2. Incompatible traditions are compared; their outputs are never averaged.
3. A report can be reproduced from immutable input, engine, doctrine, deterministic writer policy,
   and locale versions. Optional generative metadata is absent unless a separately approved adapter
   is used and never changes calculated facts or verification.
4. Browser redirects do not grant payment entitlements; verified server events do.
5. Customer claims are framed as reflective guidance, never medical, legal, financial, or
   deterministic life advice.
6. Only a captured payment with an exact stored price match can create a fulfilment set, and replay
   of any proof or provider event cannot create a second set.

## Current checkpoint

Checkpoints 1–6 are complete: durable encrypted intake, deterministic calculation/doctrine/report
contracts, authenticated customer intake and private entitlement-backed access. Checkpoint 7's
deterministic quality tooling is engineering-complete; the evaluated English content and missing
Hindi/Odia review remain correctly blocked from release.

Checkpoint 8 is engineering-complete in test mode. It adds one immutable ₹499 INR order per completed
intent, server-authoritative capture, raw signed and deduplicated provider evidence, one atomic
fulfilment set, safe ambiguity/reconciliation and approval-controlled exact refunds. Live provider,
policy, tax and operational acceptance is not complete. Checkpoint 9 owns outbox relay and deterministic
report generation. No completed checkpoint adds an LLM runtime or customer-facing confidence/ranking.
