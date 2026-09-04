# Current checkpoint

Checkpoint 4 is implemented. Checkpoint 5 is partial. Start with [cp5-intake.md](cp5-intake.md).

The canonical checkout is `D:/numerology app/platform`, branch `main`, tracking `github/main`.
The launch product calculates charts and writes reports deterministically. Customer delivery omits
confidence, ranking and verification internals.

Implemented: intent contracts/commands, encrypted persistence, optional consent, anonymous analytics,
HTTP adapters and a localized intake shell. Durable create-idempotency now atomically commits the
draft and encrypted replay response; session-backed HTTP composition verifies PostgreSQL sessions,
CSRF and draft-cookie ownership. UI navigation clamps to the earliest unanswered question.
Current API runtime still returns 503 until real dependencies are registered. The shell has no
production save/preview integration. Hindi/Odia consent is gated
pending reviewed full privacy translations.

Next: confirm sign-in provisioning (email magic-link proposed), implement session issuance and
subject provisioning, register the authenticated runtime with deployment-safe protection/rate limits,
then connect intake save/resume/complete/preview. Reviewed live privacy contact remains required.
Do not claim Checkpoint 5 complete until the acceptance conditions in its brief pass.

Development: one contract suite per slice; run affected tests/typecheck, then `pnpm verify:fast` at
handoff. Checkpoint/CI gate: `pnpm verify` (requires local PostgreSQL `numerology_test`).
Use Graphify for structural queries and `pnpm code:query Name` for exact signatures; see `AGENTS.md`.
