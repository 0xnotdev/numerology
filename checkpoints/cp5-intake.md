# Checkpoint 5: pre-payment intake

## Inputs and owned boundaries

- `packages/contracts/src/report-intent.ts`: strict create/patch input and completed snapshot schemas;
  names, confirmed Latin calculation spelling, per-occurrence Y policy, DOB, locale, email and consent.
- `packages/application/src/report-intent-commands.ts`: create/get/patch/complete and deterministic
  three-value preview. `ReportIntentRepository` and `FieldProtector` are injected application ports.
- `packages/application/src/report-intent-http.ts`: HTTP handlers, trusted session/owner resolution,
  CSRF, rate limiting and request-bound idempotency ports. Query symbols before loading the full file.
- `apps/web/src/server/report-intent-runtime.ts`: production composition seam, currently unavailable.
- `apps/web/src/intake/`: UI state, locale copy, privacy notice and validation.

## Required outcomes

- Real session/principal and subject ownership determine access. No client header becomes identity.
  Existing-intent operations require a valid, unexpired, matching signed draft cookie.
- Create is idempotent for owner + operation + UUID key + canonical request fingerprint. Exact replay
  returns the same result; a different body conflicts. Durable state must cover concurrent requests,
  process crashes and expiry; an in-memory fallback cannot satisfy production acceptance.
- Drafts remain encrypted; completion stores an immutable normalized snapshot and authoritative date.
  Preview reuses that date. Version conflicts return 409; errors expose no personal data.
- Native/Latin name policy and every Y occurrence are explicit. Adults only, using India civil dates.
  Required processing, analytics and marketing choices remain separate with durable notice evidence.
- Connect create/save/complete/preview UI to the real API. Resume loads only authorized drafts, and
  earlier required answers cannot be skipped through a URL or browser progress marker.
- Customer text contains charts, reflective interpretations and optional source-backed practices;
  internal confidence, ranking, hashes and verification data stay outside the customer projection.

## Acceptance suite

Exercise public HTTP and repository boundaries: successful create/resume/patch/complete/preview;
forged/expired/mismatched cookies; CSRF rejection; owner isolation; invalid dates/names; stale versions;
idempotency replay/conflict/concurrency/crash recovery; encrypted-storage canary and consent rollback.
Verify the connected UI handles these outcomes and uses the approved locale notice. Run focused
contracts first, implement the slice, fix failures together, then the checkpoint gate once.

## Open dependencies

Identity/session provisioning and reviewed live privacy contact/translations are not delivered by the
current UI shell. The prior durable idempotency adapter was withdrawn over crash/expiry correctness.
Keep these requirements explicit; availability must remain fail-closed until satisfied.
