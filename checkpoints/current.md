# Current checkpoint

Checkpoint 4 is implemented. Checkpoint 5 is partial. Start with [cp5-intake.md](cp5-intake.md).

The canonical checkout is `D:/numerology app/platform`, branch `main`, tracking `github/main`.
The launch product calculates charts and writes reports deterministically. Customer delivery omits
confidence, ranking and verification internals.

Implemented: intent contracts/commands, encrypted persistence, optional consent, anonymous analytics,
HTTP adapters and a localized intake shell. Current API runtime returns 503 until real dependencies
are registered. The shell has no production save/preview integration. Hindi/Odia consent is gated
pending reviewed full privacy translations.

Next: finish authenticated runtime composition and durable create-idempotency, then connect the
intake to the API. Do not claim Checkpoint 5 complete until the acceptance conditions in its brief pass.

Development: one contract suite per slice; run affected tests/typecheck, then `pnpm verify:fast` at
handoff. Checkpoint/CI gate: `pnpm verify` (requires local PostgreSQL `numerology_test`).
Find symbols with `pnpm code:query Name`; the tool prints declarations and direct references only.
