# Email magic-link sign-in

The launch sign-in flow is implemented at `/sign-in` and `/sign-in/confirm` with POST handlers at
`/api/v1/auth/magic-link` and `/api/v1/auth/magic-link/consume`. The explicit Next instrumentation
bootstrap activates it only when `CUSTOMER_RUNTIME_ENABLED=true` and every production setting passes.

## Activation prerequisites

Apply migrations through 0012. Supply production PostgreSQL, the exact public HTTPS origin, AWS KMS
encryption/HMAC keys, a verified SES sender, reviewed privacy identity/contact, cookie and maintenance
secrets, and a trusted edge client-IP header. Prevent direct origin access so that header cannot be
supplied by a browser.
The SES transport uses `ap-south-1` and the AWS SDK credential provider chain. Do not put AWS keys in
source, browser variables, URLs, logs or this document. The local envelope adapter remains test/dev
infrastructure. Never install an always-allow or process-memory limiter in production.

Apply migrations 0006 and 0007 before enabling the routes. Provision the SES identity, least-privilege
sending credentials and production sending access; no live email was sent during implementation.
Schedule `POST /api/internal/maintenance` with its bearer secret before enabling sign-in. It erases
expired pending email data, sessions, request buckets and unpaid intent/subject personal data, and removes sign-in challenge
history after 24 hours; each phase processes at most `limit` rows (1–1,000). Retry batches until zero.
Expiry rejects links immediately even if cleanup is delayed; physical removal requires that job.

The runtime registry holds stateless handlers only. Default endpoints return non-sensitive 503s.
The supplied edge budget is required for both request and redemption. PostgreSQL also limits email
issuance to one per minute and five per rolling hour across processes; throttled email requests use
the same generic 202 response and do not invalidate the still-active link.

## Security and behavior

- Tokens and browser bindings use 32 random bytes. Only domain-separated SHA-256 token/binding
  digests are persisted. Pending email is encrypted with the existing principal-email purpose;
  account lookup uses the separate HMAC key. Email is trimmed and lowercased; aliases are not folded.
- Links expire after ten minutes. They must be opened in the requesting browser. The token is a URL
  fragment, removed from history before API submission, and is never put in local/session storage.
  The confirmation page requires a click; GET requests and email scanners cannot redeem a link.
- POST requires the configured origin and JSON input, with a 4 KiB streamed byte limit. Redirect
  targets and email-link origins are fixed server-side. New and existing accounts follow the same
  request path: no principal lookup or account creation occurs before redemption.
- One PostgreSQL transaction consumes the challenge, finds/creates the principal, and issues a
  fresh session. Concurrent redemption permits only one success. Rollback leaves the link usable.
- Sessions have a fixed 24-hour lifetime, not sliding renewal. The session cookie is Secure,
  HttpOnly and host-only. A separate Secure synchronizer-CSRF cookie matches the stored digest used
  by authenticated intake. Both match the existing session verifier's domain/version format.
- On mail failure the pending link is invalidated and its email ciphertext is erased. Provider
  delivery can be uncertain: a delivered-but-invalid link requires a new request after the cooldown.
  Network failure after successful redemption likewise requires a new link if cookies were not received.
- No subject is created at sign-in. Subject provisioning belongs to intake once required personal
  details are known. Sign-in does not imply marketing consent, report access or payment entitlement.

Token safeguards were checked against the relevant single-use-token guidance in the
[OWASP cheat sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html);
this is a magic-link sign-in design, not an implementation of its password-reset workflow.

## Verification and remaining work

`pnpm --filter @numerology/database test src/magic-link.integration.test.ts` exercises real database
issuance/redemption, replay, concurrency, expiry, browser binding, origin, rate limits, rollback,
encrypted storage, cleanup and delivery failure. Web tests cover rendered page requirements,
fail-closed routing and the SES transport with a captured external request, not a live email.

Local Checkpoint 5 implementation and acceptance are complete. Deployment activation, cleanup
scheduling, reviewed controller/contact, translated Hindi/Odia notices and end-to-end browser/live-email
acceptance remain release requirements. `POST /api/v1/auth/logout` revokes the exact session and clears
session, CSRF and draft cookies; the connected intake exposes this action.

## Private report and account access (Checkpoint 6)

Successful sign-in now opens `/en-IN/account`; customers can open entitled reports or begin a new
intake. Account/report pages and all versioned APIs carry no-store, noindex/nofollow and no-referrer
policy. Unauthenticated HTML contains only the loading shell; private data is fetched through the
authenticated API. No customer-facing confidence, ranking, ownership or verification fields are sent.

- `GET /api/v1/account` lists ready, actively entitled reports. `GET /api/v1/reports/:id` returns the
  canonical customer projection. The PostgreSQL query binds the principal, order owner, report and
  active `view` entitlement together. Wrong-owner, unknown and malformed IDs share a 404 response.
- `POST /api/v1/reports/:id/requests` accepts exactly `{action: "correction" | "export" | "deletion"}`
  with a UUID `Idempotency-Key`. A 202 receipt means **requested**, not processed. Replays are durable
  and owner/report scoped; changed payloads conflict. Request and success audit commit together.
- Export, deletion and `POST /api/v1/auth/revoke-all` require authentication within the previous
  15 minutes. All writes require the configured HTTPS origin and synchronizer-CSRF token. All-device
  sign-out atomically revokes active owner sessions with its audit and clears session/CSRF/draft cookies.
- `POST /api/v1/reports/:id/signed-url` enforces the same authorization and CSRF policy, then returns
  `SIGNED_PDF_UNAVAILABLE` (501) for an entitled report. Object storage and signed links are not built.

Security audit metadata is restricted to fixed outcomes and a nonnegative count. Request correlation
IDs are generated server-side. Failed audit persistence prevents successful delivery/mutation; the
shared transaction runner handles rollback and damaged connections. Tests use encrypted synthetic
fixtures only. These routes do not create paid entitlements or execute correction/export/deletion.
