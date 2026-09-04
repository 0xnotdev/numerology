# Checkpoint 6: private report and account access

## Objective and owned boundaries

Establish recoverable, enumeration-safe ownership and entitlement enforcement before payment or
private report content is exposed. Passwordless sign-in, browser-bound single-use links, session/CSRF
cookies and single-session logout already exist from Checkpoint 5; extend them instead of replacing
them.

- `packages/application/src/private-access.ts`: one deep authorization module for account summary,
  entitled report delivery and lifecycle requests. Callers supply a verified session, never an ID.
- `packages/database/src/private-access-repository.ts`: PostgreSQL adapter joins principal,
  entitlement, report and order in one owner-scoped query. It returns encrypted snapshots only after
  an active action entitlement is proven.
- `packages/application/src/session-authentication.ts`: reusable request-local session/CSRF and
  recent-auth policy used by all private HTTP routes.
- `apps/web/src/app/[locale]/account` and `apps/web/src/app/[locale]/reports/[reportId]`: private,
  no-store/no-index shells with explicit loading, expired, revoked, reauthentication and unavailable
  states.

## Interfaces and invariants

- `GET /api/v1/account` lists only the authenticated principal's entitled ready reports and safe
  metadata. `GET /api/v1/reports/:id` returns only `CustomerDeliveryProjection`; it never exposes
  ciphertext, hashes, verification, confidence, ranking, owner IDs or provider data.
- Every report read requires an active `view` entitlement in the same PostgreSQL query as the report.
  Missing, revoked, wrong-owner and nonexistent resources share the same 404 response.
- `POST /api/v1/auth/revoke-all` requires origin/CSRF and recent authentication, revokes every active
  session for that principal atomically, and clears the current cookies.
- Correction, export and deletion requests are durable, idempotent lifecycle requests. Deletion and
  export require recent authentication; stubs return accepted/request status and never imply that
  asynchronous work is already complete. Signed-PDF URL remains an explicit unavailable stub until
  object storage exists.
- Successful and denied security-sensitive actions append non-PII audit events with correlation ID;
  append-only database controls remain authoritative. Logs and errors contain no personal data.

## Contract TDD seams

Use the continuing agreed public seams: authenticated HTTP behavior, durable repository/session/audit
behavior, and user-visible private report/account flows. Mock only time/randomness and true external
email/object-storage boundaries. Use PostgreSQL for ownership, IDOR, revocation, idempotency and audit
acceptance. Do not test internal helpers or run mutation testing.

## Acceptance and definition of done

- A signed-in customer can list and read their entitled synthetic report through the customer
  projection; another principal receives the same 404 as an unknown ID.
- Revoked/expired sessions fail immediately. State-changing requests reject missing origin/CSRF;
  recent-auth-required operations return a reauthentication response for old sessions.
- Link replay/expiry/browser binding, enumeration-safe 202, fixation-resistant new sessions and
  single-session logout remain green from Checkpoint 5.
- Private responses and pages use no-store, noindex/nofollow and restrictive referrer behavior. Tokens
  disappear from URLs; HTML/API/error/audit canaries contain no unrelated personal data.
- All repository checks, full type/lint/unit/database gates and production build pass. The code graph,
  `checkpoints/current.md` and `progress.md` are refreshed.

## Dependencies and release limits

Checkpoint 6 depends on the deterministic ready-report fixture and Checkpoint 5 authentication.
Payment does not grant entitlements until Checkpoint 8 authoritative capture; current access tests use
the explicit synthetic Checkpoint 4 fixture only. Object storage, real signed PDF links, fulfillment,
support execution and live email acceptance remain later/deployment work. No AI or LLM participates.
