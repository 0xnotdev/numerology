# Numerology Platform Progress

This is the durable implementation ledger for the platform. Update it whenever a decision is made,
a TDD cycle changes state, an artifact is built, a verification command runs, or a blocker is found.
Times are India Standard Time (UTC+05:30).

## Current status

- Current checkpoint: **Checkpoint 5 — Deterministic pre-payment intake and delivery contracts**
- State: **Checkpoint 5 IMPLEMENTATION COMPLETE; deployment release gate waiting on external inputs**
- Started: 2026-09-01 22:55 IST
- Governing specification: `/mnt/d/numerology app/research/technical-build-bible.md`, Checkpoint 4 and Sections 6, 10, 12–15, 19, 30–31, 39–40
- Last completed checkpoint: Checkpoint 4
- Production traffic: prohibited until Checkpoint 13 release gates pass

## Live progress log

### 2026-09-04 — Checkpoint 5 connected intake completion work

- Subject-provisioning contract RED/GREEN against PostgreSQL: new authenticated drafts have no
  fabricated subject; completion atomically creates an encrypted DOB/owner subject, normalized draft,
  immutable snapshot and three consent records. Migration 0008 defers subject ownership until completion.
- Building API-connected intake, shared production runtime and independent validation in parallel.
  Public HTTP/repository/user-visible tests remain the approved boundaries; no mutation audits.
  Reviewed controller/contact and Hindi/Odia privacy translations remain external release dependencies.
- 14:38–14:49 IST — Connected the intake to versioned create/save/resume/complete/preview endpoints.
  Retry keys and personal answers remain memory-only; the browser stores only a non-personal step marker.
  Collection starts only after required-processing consent. Secure resume loads before rendering answers,
  clamps incomplete deep links, safely handles 401/409/429/503 and renders only three deterministic values.
- 14:40–14:52 IST — Independent Sol validation found and drove fixes for India-vs-UTC civil dates,
  stale completion, per-name Y decisions, explicit missing-Y rejection, notice/version enforcement,
  streamed request limits, completed-form immutability and seven-day unpaid data erasure. Application
  acceptance is 30/30 green; connected web contracts are 48/48 green.
- 14:43–14:58 IST — Added atomic completion-time subject provisioning, consent-failure rollback,
  concurrent PostgreSQL rate limiting, bounded maintenance, session logout/revocation and migrations
  0008–0010. Expiry clears unpaid draft/snapshot/hash/name/DOB data while preserving consent evidence
  and excluding order/report-linked records. Database acceptance is 39/39 green.
- 14:52–14:59 IST — Added production AWS KMS envelope/HMAC protection, explicit instrumentation
  bootstrap, SES composition, trusted-edge request budgets and authenticated maintenance. Unreviewed or
  incomplete config leaves collection/API fail-closed. Graphify refreshed to 1,381 nodes/4,328 edges.
  `verify:fast`, production Next build and full PostgreSQL suite are green; the initial full gate found
  and corrected only formatting plus a database-root bundling import. No mutation audit was run.
- 15:02 IST — The npm advisory endpoint repeatedly returned a network error during the final
  production dependency audit, so that online-only check is recorded as unavailable rather than
  falsely reported green. The pinned dependency install passed repository supply-chain policy.

### 2026-09-04 — Checkpoint 5 email magic-link sign-in

- 14:10 IST — User approved email magic-link sign-in. Continued at the approved public HTTP,
  repository and user-visible seams using contract TDD. Account verification is separate from
  subject provisioning: no invented birth date or placeholder personal details are inserted at login.
- 14:12–14:17 IST — RED/GREEN issuance and redemption: browser-bound 256-bit tokens, ten-minute
  lifetime, POST-only redemption, explicit HTTPS origin, strict 4 KiB streamed request limit,
  normalized email HMAC lookup and encrypted pending email. Principal creation, challenge consumption
  and fresh 24-hour session issuance share one transaction. Session/CSRF token digests match the
  existing authenticated-intake verifier. No account is created before mailbox verification.
- 14:17–14:21 IST — Added sign-in and explicit confirmation pages plus fail-closed Next endpoints.
  Tokens travel in URL fragments, are removed from history before submission and stay out of browser
  storage. Added plain-text SES delivery adapter (Mumbai region), cancellation, one SDK attempt,
  invalidation on send failure and an explicit configuration function. No live email sent.
  The latest SES SDK caused pnpm to auto-add a release-age exception; removed that exception and
  restored/re-resolved only this turn's generated lockfile changes using pinned 3.1100.0. Supply-chain
  policy remains unchanged; no global configuration or approval bypass was used.
- 14:22 IST — Durable email budget (one/minute, five/hour), expiry, concurrent redemption,
  cross-origin rejection, oversized input, provider failure, repeat account lookup and encrypted
  storage tests pass. Expired pending emails have a bounded cleanup adapter; challenge history is
  deleted after 24 hours when maintenance runs. Forced-connection test found the general transaction
  runner needed checked-out client error handling; fixed it and verified clean retry. Six database
  tests and three web/transport tests pass so far. Runtime activation, cleanup scheduling and shared
  edge abuse limits remain explicit deployment dependencies rather than in-memory fallbacks.
- 14:23–14:27 IST — Added database constraints/index for pending sign-in payload integrity and
  bounded cleanup, explicit deployment activation documentation, and rollback proof for principal
  creation/session issuance. Added a configuration seam that composes the durable repository and SES
  transport only when production dependencies are supplied. Full verification is GREEN: lint,
  formatting, migration consistency, strict types, tooling, all application/domain/database tests,
  coverage/release gates and Next production build including `/sign-in`, `/sign-in/confirm` and both
  POST endpoints. Totals: 428 application/database tests plus one tooling test. `pnpm audit --prod`
  reports no known vulnerabilities. Graphify refreshed to 1,286 nodes/4,080 edges. No live email,
  mutation audit, production database or secrets were used. Checkpoint 5 remains partial.
- 14:27 IST — Final UI RED/GREEN: home now links to sign-in and no longer claims drafts are saved
  before API-connected intake exists. Its new public render contract, web typecheck and focused
  formatting/lint checks pass. Combined suite evidence now covers 429 application/database tests
  plus the tooling test; the full gate preceded this small navigation/copy-only follow-up.

### 2026-09-04 — Checkpoint 5 durable create slice

- 13:53 IST — Resumed from the checkpoint brief with a clean checkout. User confirmed public HTTP,
  durable repository/idempotency and visible intake test seams. Scoped graph refreshed; no research
  corpus or mutation audit loaded. Identity provisioning choice requested separately.
- 13:55–14:01 IST — RED: integration contract failed for absent durable adapter. Implemented an
  explicit transaction-scoped command callback: draft insert and encrypted response commit together.
  PostgreSQL transaction advisory locks reject concurrent duplicates without waiting; connection loss
  rolls back uncommitted state. Added generated migration 0005, owner-bound request fingerprints and
  stable resource IDs. Completed replay survives adapter restart; failed response generation rolls
  back the draft. Expired keys return 409 and require a fresh key; records remain owner-scoped
  tombstones (deleted with the principal), never recycled into a conflicting deterministic resource.
- 14:01 IST — Three database/HTTP integration contracts pass: rollback/retry, encrypted-response
  canary, exact replay, conflicting body, expiry, concurrency, owner isolation, secure cookie and
  case-insensitive UUID replay. HTTP test exposed the canonical `sha256:` prefix requirement;
  adapter now validates the full format and stores the digest. Existing seven HTTP tests pass.
  PostgreSQL requires an active WSL instance on this host; kept it active during verification.
- 14:03–14:05 IST — RED/GREEN session-backed HTTP slice: PostgreSQL session adapter checks revocation,
  creation time and both expiry deadlines. Request-local composition hashes the 32-byte opaque
  session token, ignores client principal claims, rejects duplicate session cookies, requires the
  configured HTTPS origin plus matching synchronizer CSRF for writes, and keeps signed draft-cookie
  checks for existing intents. Session lookup failures return a non-sensitive 503. No global session
  state, session issuance, fake identity, or runtime activation was introduced.
- 14:04–14:05 IST — RED/GREEN UI guard: requested route/progress steps are clamped to the earliest
  unanswered required question. Existing accessibility/localization tests now provide valid earlier
  answers when rendering later steps; six form tests pass. No claims of connected autosave were added.
- 14:05–14:07 IST — Added a real backend-termination test in the dedicated local test database. It
  exposed an unhandled checked-out pg client error; the adapter now handles that error and discards
  the broken connection. Rollback leaves no orphan draft and a new connection retries successfully.
  Five database integration tests pass across durability and authenticated intake. Removed obsolete
  read-after-crash reconciliation in favor of atomic commit and narrowed scoped commands to create.
  Database typecheck passed. Full checkpoint verification started; C5 remains partial pending the
  explicit provisioning, live privacy and connected-UI dependencies in its brief.
- 14:08–14:09 IST — Full gate passed lint, formatting, migration metadata check, strict typechecks,
  tooling test, application/domain suites, unchanged coverage thresholds, release checks and Next
  production build. Database gate exposed the expected table inventory needing the new migration;
  updated that contract and reran the database suite: all 22 tests across 10 files pass. Combined
  verification: 419 application/database tests plus one tooling test. No unrelated full rerun or
  mutation audit. Graphify incrementally refreshed to 1,231 nodes/3,975 edges. Runtime remains
  fail-closed; checkpoint completion is not claimed. Migration tested only on local numerology_test.

### 2026-09-04 — Actual Graphify integration

- Installed upstream `graphifyy[mcp]==0.9.53` in an isolated uv tool environment. Added pinned setup,
  source-only incremental build, bounded query, explain, path, MCP and optional smoke-check commands.
  No Graphify dependency enters the product runtime or mandatory CI; indexing uses no LLM.
- Added `.graphifyignore` app/package allowlist with reference, secret, test and generated exclusions;
  excluded derived `graphify-out/` from Git and ordinary searches. First extraction: 135 code files,
  1,217 explicit nodes, 3,931 edges, approximately seven seconds. Warm build detected no changes.
- Verified known planner calls against source; Graphify missed the handler-factory-to-normalizer
  directed path. Adopted Graphify for navigation, retaining the TypeScript exact-signature helper
  and scoped source reads as fallbacks. No proven percentage savings or quality improvement claimed.
- Configured a workspace-local, read-only stdio MCP allowlist at the parent `.codex/config.toml`
  (machine paths stay local, outside this Git repository); documented portable setup. MCP protocol
  initialization, tool discovery and a bounded ReportPlan query passed via `pnpm graph:check`,
  together with source-scope and known-call assertions. Reopen the trusted task to load new tools.
- Updated concise agent/checkpoint pointers and the on-demand development guide. Product checkpoint
  state remains C5 partial; no product behavior changed.
- CLI smoke testing caught upstream question-before-flags parsing and advisory budgets that can
  overflow with edges. Added a shell-free query wrapper with a 30-second timeout and 6,000-character
  output ceiling; smoke asserts the ReportPlan source location and bounded output. Scope, three
  known calls, CLI lookup, MCP tool discovery and MCP query all pass. `pnpm verify:fast` passed;
  final wrapper changes passed focused Biome checks and the Graphify smoke. No mutation audit run.

### 2026-09-04 — Efficient development workflow

- 13:26–13:30 IST — Fast-forwarded the canonical `platform/` checkout on `main` from `9a8f2e3` to
  `github/main` (`3963bdc`) and configured tracking. Frozen-lockfile install restored current dependencies.
  Verified all five in-project auxiliary worktrees have clean tracked/untracked state, only generated
  ignored files, and HEAD commits reachable from `github/main`; began normal, non-force worktree removal.
- 13:30 IST — Moved the QA directory intact to `D:/numerology-archives/2026-09-04/qa`; verified 1,211
  files and 220,236,029 bytes before/after. This is a reversible archive move, not deletion. Added
  workspace/repository ignore files to exclude worktrees, QA, deliverables and generated files from
  ordinary searches. Workspace-level ignore/entry files are local because the Git root is `platform/`.
- 13:31 IST — Replaced the broad startup policy with a compact current-checkpoint summary and a
  Checkpoint 5 brief based on existing implementation contracts. Agent reads of research/QA/deliverables
  are excluded from normal implementation. Adopted contract suites per vertical slice and concise
  milestone logging; preserved the historical ledger. Future checkpoint briefs require known contracts.
- 13:32 IST — Removed all Stryker invocations from normal verification and CI's transitive command
  path. Kept a separate manual `audit:mutation:offline` command. `verify:fast` provides the development
  handoff gate; `verify` retains database integration, formula sign-off, release fixtures and build.
  Domain suites run once with coverage; existing 95% branch thresholds remain and 90% line floors are
  now explicit. Coverage and mutation sensitivity are different measures; no equivalence claim is made.
- 13:34 IST — Added a TypeScript AST declaration/reference index: `code:index` writes an ignored cache,
  `code:query Symbol` rebuilds from current source and prints bounded declarations and direct references.
  Public tooling contract failed at the absent module, then passed with the implementation. It checks
  alias references, source-only traversal, omitted bodies/initializers, exact queries and fresh rebuilds.
  Indexed 1,084 declarations in 134 source files. This is a syntactic index, not a runtime call graph.
- 13:35 IST — Revised `pnpm verify` passed: 413 application/database tests plus the tooling contract,
  strict typecheck, Biome, migration drift, formula sign-off, doctrine/report release checks and Next
  production build. Branch/line coverage: engine 96.32%/98.70%, doctrine 96.45%/97.78%, report
  95.10%/97.33%. Updated index contract and focused Biome checks also passed after output hardening.
  Stopped the exact temporary PostgreSQL keeper process. No mutation audit was run.
- 13:36 IST — Completed normal removal of all five requested in-project worktrees, including 132,175
  ignored generated files counted before removal. All source commits and branch refs remain in Git.
  The separate detached worktree under `/home/ansh/.treehouse/` was retained outside the requested
  workspace cleanup. Ordinary scoped `rg --files` now returns 306 files in the implementation checkout.
  Preserved the two residual Treehouse state files and empty wrappers at
  `D:/numerology-archives/2026-09-04/treehouse-platform-state`.

### 2026-09-04 — Publication and intake correction pass

- 00:21 — Reviewed the current production worktree and completed the remaining intake safety fixes before
  publication: native form submission is explicitly POST-only with `preventDefault`, eliminating accidental
  GET query-string exposure of names, date of birth, and email when JavaScript is active.
- 00:22 — Replaced boolean/singular Y handling with occurrence-level, calculation-text-indexed
  `yClassifications`; non-Latin names use only their confirmed Latin calculation spelling, and every Y
  occurrence must be classified independently.
- 00:22 — Added India civil-date boundary tests around UTC midnight and retained `Asia/Kolkata` date
  derivation for adult eligibility and date-input max values.
- 00:22 — Added an explicit consent-locale gate for Hindi and Odia until the substantive privacy notice
  is reviewed and translated; no untranslated consent checkbox is presented or accepted in those locales.
- 00:23 — Targeted intake tests passed (10 tests); Biome lint/format passed for the changed files.
- 00:23 — Repository gate passed: lint, format check, strict typecheck, unit tests (all 28 web tests),
  database schema drift check, doctrine release verification, report fixtures, report release verification,
  report coverage (95.10% branches), production Next.js build, and live PostgreSQL integration tests
  (8 files, 17 tests).
- 00:25 — Security publication scan found no private keys, access tokens, production credentials, backup
  dumps, document artifacts, or ignored build/dependency outputs in the publish set. `.env.example` and
  local PostgreSQL fixture credentials remain explicitly non-production examples documented as such.
- 00:26 — Committed the verified release as `1854baf` (`feat: publish deterministic numerology platform
  through checkpoint 5`) with 141 files and no staged unsafe paths.
- 00:26 — Pushed `1854baf` to `https://github.com/0xnotdev/numerology.git` as `main` and verified the
  remote ref and a clean local worktree. The parent workspace's research/QA scratch directories and
  DOCX/PDF artifacts remain outside this implementation repository and were not copied into the public
  codebase.

### 2026-08-31

- 20:17 — Started Checkpoint 1.
- 20:17 — Re-read the repository context, README, all accepted ADRs, Next.js agent instructions,
  the Checkpoint 1 specification, and the workspace inventory.
- 20:17 — Confirmed that the existing build bible is the implementation authority and the supplied
  numerology blueprint/research corpus is domain evidence, not executable instruction.
- 20:17 — Adopted red-green vertical slices. Tests will observe only the confirmed public seams below.
- 20:17 — Created this progress ledger before the first Checkpoint 1 implementation change.
- 20:26 — Completed the relevant corpus review: canonical synthesis, product specification, data
  model, full Checkpoint 1 contract, intake/domain/database/API/backend/security/privacy/testing/CI/
  recovery/versioning sections, both DOCX structures, repository code, and Next.js instructions.
- 20:26 — Validated current Drizzle, node-postgres, Node 24 crypto, and PostgreSQL 17 behavior against
  official documentation; pinned the intended migration/transaction/pool/encryption approach.
- 20:26 — Accepted ADR 0005 for committed Drizzle migrations, a five-client default pool, single-client
  transactions, purpose-bound envelope encryption, separate lookup HMAC, and write-once snapshots.
- 20:29 — TDD encryption cycle 1 RED: the round-trip/no-plaintext test failed because
  `LocalEnvelopeFieldProtector` did not exist.
- 20:31 — TDD encryption cycle 1 GREEN: version-1 envelope protection round-trips and stored bytes do
  not contain the confidential plaintext.
- 20:32 — TDD encryption cycle 2 RED: the stable purpose-separated lookup test reached the intentional
  unimplemented lookup method.
- 20:32 — TDD encryption cycle 2 GREEN: lookup HMACs are stable, 32-byte, purpose-separated, and use a
  key independent from field encryption.
- 20:33 — TDD encryption cycle 3 RED: wrong-key decryption exposed the underlying OpenSSL error instead
  of the required safe application error.
- 20:34 — TDD encryption cycle 3 GREEN: wrong key, wrong purpose, malformed metadata, and authentication
  failures collapse to `FIELD_PROTECTION_FAILED` without leaking parser/OpenSSL detail.
- 20:35 — Diagnosed Docker Desktop 4.75 startup failure as a stale zero-byte `dockerInference` runtime
  socket. Host policy blocked deleting that exact socket; Docker images/volumes were not changed.
- 20:40 — Installed PostgreSQL 17.11 from the official PGDG repository inside Ubuntu 24.04 WSL,
  started cluster `17/main`, and created isolated `numerology` and `numerology_test` databases owned by
  the local `numerology` role. Windows localhost TCP connectivity on port 5432 is verified.
- 20:42 — Database cycle 1 setup paused before test execution because pnpm blocked Drizzle Kit's
  `esbuild` postinstall. Added only `esbuild` to the existing built-dependency allowlist.
- 20:43 — TDD database cycle 1 RED: the empty-database migration test failed because the database
  package had no implementation.
- 20:49 — TDD database cycle 1 GREEN: PostgreSQL 17.11 migrates from an empty schema to exactly the
  eight business tables plus `schema_migrations`; no order/report tables exist.
- 20:50 — TDD database cycle 2 RED: an `audit_events` row could still be updated, proving append-only
  evidence was not yet enforced by PostgreSQL.
- 20:50 — TDD database cycle 2 GREEN: PostgreSQL triggers reject update/delete of both audit and consent
  evidence with stable SQLSTATE `55000`.
- 20:51 — TDD database cycle 3 RED: the rollback behavior test reached the absent PostgreSQL
  transaction runner.
- 20:52 — TDD database cycle 3 GREEN: failed application callbacks issue rollback on the same checked-
  out client, persist no partial row, and release the client.
- 20:53 — TDD repository cycle 1 RED: encrypted draft persistence reached the absent synthetic fixture
  and report-intent repository seams.
- 20:56 — TDD repository cycle 1 GREEN: encrypted drafts create/resume through the public repository;
  a seeded plaintext name/date canary is absent from persisted intent bytes.
- 20:57 — TDD repository cycle 2 RED: concurrent writers reached the absent `saveDraft` repository
  operation.
- 20:59 — TDD repository cycle 2 GREEN: two version-1 writers produce one version-2 update and one
  stable conflict; stale state is never silently overwritten.
- 21:00 — TDD repository cycle 3 RED: immutable completion reached the absent `complete` repository
  operation.
- 21:01 — TDD repository cycle 3 GREEN: completion advances to version 2/status `complete`; PostgreSQL
  refuses snapshot/hash/notice/consent rewrites with SQLSTATE `23514`.
- 21:03 — TDD cleanup cycle 1 RED: expiry processing reached the absent application command.
- 21:04 — TDD cleanup cycle 1 GREEN: the injected clock selects due drafts, the application command
  writes an encrypted empty-draft tombstone, and the repository expires only eligible rows inside the
  transaction boundary. Database and application type checks remain green.
- 21:11 — TDD health cycle 1 RED: the liveness HTTP contract failed because
  `GET /api/health/live` did not exist.
- 21:12 — TDD health cycle 1 GREEN: liveness now returns a no-store HTTP 200 from process state only;
  the legacy combined route was removed, generated Next route types were refreshed, and the web type
  check passes.
- 21:12 — TDD health cycle 2 RED: the safe readiness contract failed because
  `GET /api/health/ready` did not exist.
- 21:14 — TDD database-readiness cycle RED → GREEN: the absent probe first failed; the green probe
  bounds `SELECT 1` to less than 100 ms and returns a boolean instead of leaking driver failures.
- 21:15 — TDD persistence-config cycle RED → GREEN: database URL, pool ceiling, connection timeout,
  and readiness timeout now parse through a bounded typed environment contract.
- 21:16 — TDD health cycle 2 GREEN: thrown configuration/database errors produce a no-store, detail-free
  HTTP 503 response.
- 21:17 — TDD health cycle 3 RED → GREEN: a healthy database initially still produced 503; the handler
  now returns HTTP 200 only when its readiness probe succeeds.
- 21:19 — TDD developer-fixture cycle RED: the local/test-only access policy did not exist.
- 21:20 — TDD developer-fixture cycle GREEN: `/dev/readiness` renders database status only in
  development/test and calls `notFound()` in production; its policy test and web type check pass.
- 22:19 — TDD identifier cycle RED: the application-owned ID generator port did not exist.
- 22:20 — TDD identifier cycle GREEN: the application package now exposes a cryptographically random,
  128-bit UUID generator; uniqueness/format behavior and type checks pass. UUIDv4 is used because the
  source contract permits UUIDv7 **or** 128-bit random identifiers and Checkpoint 1 has no ordering need.
- 22:20 — TDD schema-verification cycle RED: the migrated database had no executable catalog verifier.
- 22:22 — TDD schema-verification cycle GREEN: the verifier proves all required tables, critical
  constraints, partial indexes, and append-only/snapshot triggers exist; `drizzle-kit check` also passes.
- 22:23 — TDD local-key-configuration cycle RED: explicit environment key material could not construct
  the field-protection adapter.
- 22:24 — TDD local-key-configuration cycle GREEN: local configuration now requires canonical 256-bit
  KEK/HMAC keys plus an explicit key ID/version, and its encrypted round-trip/type checks pass.
- 22:29 — First full acceptance run: lint, format, migration drift, every type check, and all 29 tests
  passed. The production build then failed because the web readiness route imported the database barrel,
  causing Next.js to traverse the filesystem-backed migration runner.
- 22:30 — Packaging fix GREEN: the web app now imports explicit database pool/readiness subpaths; the
  migration runner remains outside its dependency graph and the production build passes with all three
  Checkpoint 1 dynamic routes.
- 22:31 — Built-app HTTP QA passed: healthy live/ready return 200, unavailable PostgreSQL returns a
  detail-free 503, the legacy combined route is 404, the developer fixture reflects both database
  states, and the fixture itself is 404 when `APP_ENV=production`.
- 22:34 — Added PostgreSQL 17.11 Compose/CI configuration, guarded test-database initialization,
  explicit local-only key fixtures, package READMEs, and the restore runbook. `docker compose config`
  passes; the host Docker Desktop daemon remains unavailable.
- 22:35 — The first restore command stopped before creating an artifact because WSL `sudo` required a
  password. Terminated that waiting process and confirmed no backup or validation database existed.
- 22:36 — Isolated logical restore drill GREEN: custom-format backup SHA-256
  `caacadfc9574a238a9789d05e3af7db0552add07bf51fe47920f6c94cb8820f7` restored into the exact
  validation database with nine tables/one migration; the script then removed only its own database
  and `/tmp` backup.
- 22:37 — Container-stage verification GREEN: migration drift, type checks, 19 non-database tests, and
  the production build pass without requiring a database during image construction. Full CI retains
  the PostgreSQL 17 integration gate.
- 22:38 — Final full repository verification GREEN: lint, format, migration drift, five workspace type
  checks, 29 tests across 14 files, and the Next.js 16.3.3 production build all pass. Restore-script
  syntax and the Compose manifest also validate.
- 22:39 — Standalone production artifact QA GREEN: the same `server.js` used by the Docker runtime
  starts successfully and returns HTTP 200 from both live and database-backed ready endpoints.
- 22:44 — Tightened the readiness default to 75 ms and rejected values above 99 ms so the implemented
  deadline is literally sub-100 ms. The final full gate passed again with 29/29 tests and no process
  left listening on the development port.
- 23:32 — Started Checkpoint 2 in isolated worktree
  `/mnt/d/numerology app/platform/.treehouse/platform-08d229/1/platform` on branch
  `fm/numerology-checkpoint-2`; `pwd -P` and `git rev-parse --show-toplevel` both resolved to the
  worktree.
- 23:32 — Loaded the graphify skill and used an equivalent structured inventory because this checkout
  has no existing `graphify-out/graph.json`: 92 non-derived repository files, 34 source files,
  14 test files, 14 Markdown docs, 20 config files, 2 SQL files, 1 asset, and 1 lockfile were
  inventoried under the worktree; dependency direction is `apps/web -> contracts/database/engine`,
  `database -> application`, while `application`, `contracts`, and `engine` remain framework-free.
- 23:33 — Completed the Checkpoint 2 source audit before behavior changes: read `CONTEXT.md`, root and
  package READMEs, all ADRs, runbooks, CI/configuration, existing source/tests/migrations, the full
  technical build bible, all 20 research chapters plus canonical synthesis/current technical sources,
  data schemas/fixtures/registries, and inspected DOCX/QA/rendered outputs enough to classify them as
  generated artifacts rather than implementation authorities.
- 23:33 — Reconstructed the Checkpoint 2 boundary: pure deterministic engine only; no database changes,
  public API, payment, model, doctrine planner, report generation, or production cloud resources. Required
  work is identity normalization, profile-aware reduction, Western/Cheiro/Johari alphabets and metrics,
  Lo Shu raw/augmented geometry, bundle validation, canonical SHA-256 hashing, a local fixture CLI, a
  synthetic-only engine explorer fixture page, golden/property coverage, and explicit warnings for
  unsupported scripts/transliteration/Y ambiguity and excluded Johari predawn policy.
- 23:33 — Document conflict recorded and resolved for implementation: the build bible's illustrative
  TypeScript snippet uses dotted profile IDs (`western.decoz.v1`), while the governing machine-readable
  registry, test vectors, research chapters, and product spec use underscore IDs
  (`western_decoz_v1`, `cheiro_1926_v1`, etc.). Checkpoint 2 will use underscore IDs as canonical and
  expose aliases only if needed at boundaries, because the data registry/test fixtures are the executable
  formula release inputs.
- 23:36 — Baseline attempt with `corepack pnpm verify` failed before repository checks because nested
  scripts could not find the `pnpm` shim. Ran `corepack enable`; reran `pnpm verify` successfully:
  Biome lint/format, Drizzle migration drift check, five workspace type checks, 29 tests across 14 files,
  and Next.js production build all passed on the pre-Checkpoint-2 code.
- 23:45 — Checkpoint 2 TDD RED: added focused engine tests for reduction policies, immutable alphabets,
  Western/Balliett examples and derived metrics, Cheiro/Johari boundaries, Lo Shu raw/augmented grids,
  deterministic bundles/warnings/validation, manifest hashing, and fixture CLI. The focused
  `pnpm --filter @numerology/engine test` run failed with 27 expected missing-function failures.
- 00:00 — Checkpoint 2 engine GREEN: implemented the pure deterministic engine (`packages/numerology`)
  with profile-aware reducers, immutable alphabets, Western/Cheiro/Johari/Lo Shu profile functions,
  canonical bundle hashing/validation, warnings, and fixture CLI support. Focused validation passed:
  `pnpm --filter @numerology/engine typecheck`; `pnpm --filter @numerology/engine test` (34 tests across
  8 files). Corrected one RED test expectation after checking the 2000-02-29 DOB has four zeros, not five.
- 01:45 — Full `pnpm verify` passed after the main Checkpoint 2 implementation: Biome lint/format,
  migration drift, all five workspace typechecks, 64 engine tests plus all Checkpoint 1 tests (database
  integration included), and Next production build; the build exposes `/dev/engine` as a dynamic route.
- 01:48 — Built-app QA returned HTTP 200 with synthetic engine markers in development and HTTP 404 for
  `/dev/engine` under `APP_ENV=production`.
- 01:53 — Continued the preserved implementation with RED/GREEN hardening slices: customer-confirmed
  transliteration is now the only non-Latin name calculation path; NFC/token/classification helpers,
  safe malformed-request/bundle diagnostics, frozen Lo Shu geometry/profile IDs/fixtures, strict
  manifest references and metadata, first-century Gregorian dates, and exact Cheiro/Johari/Lo Shu traces
  are covered by focused tests. The concise engine-inventory aliases are exported without adding a
  second calculation path. Added canonical handbook/divergence fixture IDs from `data/test-vectors.csv`
  and the Johari projected-year fact with explicit target-year suffix/weekday metadata. Updated root and
  engine-package documentation for the Checkpoint 2 CLI and synthetic `/dev/engine` boundary.
- 01:53 — Focused Checkpoint 2 gate passed after hardening: `pnpm --filter @numerology/engine test`
  (66 tests across 10 files) and its strict typecheck. A clean dependency rehydrate was needed because
  the inherited worktree `node_modules` contained Windows-only Biome/Rolldown optional packages; only
  derived worktree dependencies were removed and restored with `pnpm install --frozen-lockfile`.
- 20:25 — TDD hardening RED → GREEN: Western vowel-only/consonant-only name views now omit the
  inapplicable Soul Urge or Personality fact and emit the explicit `NAME_METRIC_NOT_APPLICABLE`
  diagnostic instead of throwing or inventing a value. Engine identity normalization now collapses
  calculation spacing, rejects names over 120 Unicode scalar values, and keeps the NFC display form.
- 20:29 — Checkpoint 2 verification passed after the first hardening slice: `pnpm verify` completed
  lint, formatting, migration drift, all five workspace typechecks, and the production Next.js build;
  the engine suite had 70 passing tests at that point.
- 20:36 — TDD validation hardening RED → GREEN: explicit `asOfDate` now bounds civil dates and enforces
  the 18+ intake boundary; malformed script/locale/Y metadata is rejected; canonical JSON normalizes
  both string values and object keys to NFC without locale-dependent sorting.
- 20:38 — Final Checkpoint 2 verification passed: `pnpm verify` completed lint, formatting, migration
  drift, all five workspace typechecks, 72 engine tests plus Checkpoint 1 tests (94 tests across 23
  files, including PostgreSQL integration), and the production Next.js build with guarded `/dev/engine`.
  No remote operations were performed.
- 20:39 — Committed the completed Checkpoint 2 implementation on `fm/numerology-checkpoint-2` as a
  local commit (no remote operations).
- 02:31 — Started Checkpoint 3 in isolated worktree
  `/mnt/d/numerology app/platform/.treehouse/platform-08d229/3/platform` on branch
  `fm/numerology-cp3-planner`; `pwd -P` and `git rev-parse --show-toplevel` both resolved to the
  disposable worktree before branching.
- 02:31 — Cherry-picked the completed Checkpoint 2 release
  `0dc5f35d3ed269e604974af3f23f5b92c627ff29` as local commit `1c006eb`; the clean resulting baseline
  passed `corepack pnpm verify`: Biome lint/format, migration check, all strict workspace type checks,
  94 tests across 23 files (including Checkpoint 1 PostgreSQL integration), and the production Next.js
  build.
- 02:31 — Audited the Checkpoint 3 contract and source hierarchy: build-bible Checkpoint 3 and Sections
  9 (registry), 10 (report schema/mandatory order), 11 (scoring/balance), and 13 (fail-closed gates);
  interpretation, combination, contradiction, and epistemic research; `rule.schema.json`; the
  contradiction CSV; current context/README; and ADRs 0001–0005. The doctrine compiler is deliberately
  out of this slice: `packages/report` will accept typed resolved doctrine evidence from the future
  `DoctrineRegistry.resolve` worker seam rather than reading data files or a database.
- 02:31 — Conflict decision: the build bible calls evidence classes `primary`/`authoritative_practitioner`/
  `derived_product_policy`, while the current machine-readable rule schema uses claim classes `A`–`G`
  and richer review/status fields. The planner boundary preserves the current schema's `A`–`G` claim
  classes and review/status semantics, maps source provenance explicitly, and applies the build bible's
  stricter customer gate (active/approved, sourced, non-low confidence) as the highest-authority current
  technical contract. The planner will not manufacture the unresolved Johari 9x9 matrix: generated
  pair claims whose two inputs are Johari-only are blocked unless an authored, sourced combination arrives.
- 02:37 — Checkpoint 3 TDD RED: added `@numerology/report` synthetic golden-plan tests before a planner
  implementation. The focused command `corepack pnpm --filter @numerology/report test` failed as expected
  because `./index` did not exist. The test suite specifies byte-stable plans/hashes under collection-order
  changes; independent convergence versus same-family unique signals; explicit matrix conflicts and derived
  complements; mandatory reservations/order; word/balance/timing/action caps; evidence/fact/source/trace
  provenance; malformed evidence; safety abstention; and tamper validation. No third-party dependency was
  added: the package uses the existing workspace engine only for its immutable calculation types, validation,
  and canonical hash implementation.
- 02:48 — Audit completion decision: the root ontology is explicitly only a cross-school index and the
  81-cell Johari skeleton is entirely `unresolved`; therefore the planner accepts only authored theme tags
  in resolved doctrine evidence, labels planner-generated complements `G`/`derived`, and refuses a derived
  complement when its candidate combines two Johari-only facts. The safety-policy hard blocks (medical,
  pregnancy, finance/gambling, legal, employment/eligibility, physical safety, coercion, and related
  high-stakes tags) are filtered before scoring; actions are restricted to free/low-cost, reversible,
  low-risk catalogue entries. This is stricter than the current source tags and leaves safety-specific
  response wording to the later doctrine/writer layer.
- 02:55 — Checkpoint 3 TDD GREEN: implemented `packages/report` as a pure typed package with an explicit
  `ResolvedEvidenceBundle` doctrine-worker seam, source/fact/trace/action provenance, authored-versus-
  derived theme markers, independent-family scoring, same-family repetition handling, explicit
  contradictions, fixed 18-section reservations, core-fact/method reservations, word/root/timing/action
  constraints, fail-closed input/plan validation, and the engine's canonical SHA-256 plan hash. Focused
  verification passed: `corepack pnpm --filter @numerology/report test` (11 tests) and
  `corepack pnpm --filter @numerology/report typecheck`; root Biome lint/format checks also passed. The
  initial order-stability test exposed collection-order truncation of supporting evidence; GREEN retains
  every supporting rule on one theme claim rather than slicing it, so profile convergence is stable.
- 03:06 — Final planner hardening GREEN: theme definitions can distinguish authored and derived ontology
  records, but only authored resolved rules can become direct claims; derived complements remain explicit
  class `G`. Matrix resolution labels are now preserved verbatim (for example `immutable_table_id`) and
  shown as contradiction provenance rather than collapsing every disagreement to one generic outcome.
  Added coverage for the unresolved Johari-only pair abstention, profile/fact mismatch, core-fact/method
  reservations, and the maximum two-consecutive-tensions constraint.
- 03:15 — Final full verification GREEN: `corepack pnpm verify` passed Biome lint/format, Drizzle migration
  check, all six strict workspace type checks, 105 tests across 24 files (11 report, 72 engine, and all
  Checkpoint 1 integration tests), and the production Next.js build. No database schema, provider, model,
  Next.js delivery behavior, or doctrine data/compiler was changed. Remaining planned work is the separate
  doctrine compiler/release artifacts and the later deterministic writer/verifier checkpoints.

## Checkpoint 2 production remediation evidence

### 2026-09-01

- Created `fm/numerology-cp2-production` directly from canonical commit `0dc5f35`; no Checkpoint 3 branch was integrated.
- Reproduced the user-visible Karmic Debt defect on the real bundle path with `pnpm --filter @numerology/engine exec tsx -e 'import { westernExpression } from "./src/index.ts"; console.log(JSON.stringify(westernExpression("ZZZZZZA")));'`: the token compound was `49`, its trace was `49 -> 13 -> 4`, and the result incorrectly exposed `compound: 4` with no debt. Compared with `ZZZZZZ` (`48 -> 12 -> 3`) before changing the reducer. The fix scans the reduction paths belonging to the metric (including name-token reductions), while date component reductions remain separate from the user-visible final Life Path compound; the final bundle fact now exposes debt `13` without changing initiating input, masking policy, or trace output.
- Replaced the partial fixture assertions with generated complete expected bundles in `packages/numerology/src/fixtures.expected.ts`. `pnpm --filter @numerology/engine test:fixtures` passed all 17 fixture tests, including exact facts, warnings, hashes, and complete traces for every fixture.
- Decomposed `packages/numerology/src/bundle.ts` into input, profile, fact, builder, and validation modules; centralized recursive freezing in `src/deep-freeze.ts` with direct nested-value tests. Public exports and calculation behavior remain unchanged.
- Added `packages/numerology/formula-review-signoff.json` and `scripts/verify-formula-review.ts`; the check verifies the approved reviewer/date/evidence, engine and manifest hashes, reviewed formula inventory, and exact SHA-256 hashes for all covered implementation files.
- Added deterministic V8 branch coverage and Stryker/Vitest mutation gates to ordinary `verify` and `verify:container` commands. `pnpm --filter @numerology/engine test:coverage` passed at **96.78% branches** (602/622); `pnpm --filter @numerology/engine mutation` passed at **90.60% mutation score** (346 killed / 381 scored mutants across the profile formula layer: Cheiro, Johari, Lo Shu, and Western); no threshold was weakened or bypassed.
- Complete repository gate: `pnpm verify` passed lint, format check, migration check, all five workspace typechecks, 107 engine tests plus Checkpoint 1 tests (all repository tests passed), the fixture gate, 96.78% branch gate, 90.60% mutation gate, formula sign-off, and the production Next build.
- Container validation: `pnpm verify:container` passed the no-database lint, format, migration, typecheck, unit, fixture, 96.78% branch, 90.60% mutation, formula sign-off, and production build gates. Packaging evidence: `pnpm --filter @numerology/engine pack --dry-run` passed and produced no tarball in dry-run mode. `docker build -t numerology-platform:checkpoint-2-production .` was attempted after `docker info`; Docker is unavailable in this WSL distro (`docker` command not found), so no image was created or daemon modified.
- done: branch `fm/numerology-cp2-production` is clean at commit `a541cc9e4c33027e35d40559063f3f358db22d17`; branch coverage is 96.78%, mutation score is 90.60%, `pnpm verify`, `pnpm verify:container`, and package dry-run passed, and the Docker-unavailable exception is recorded above.

## Checkpoint 3 integration production evidence

### 2026-09-01

- Created `fm/numerology-cp3-integration-production` from exact doctrine commit
  `1edde24bb14485e226ac5d8b2b40d9418b411227`, then transplanted only planner commit
  `b458616b558412cfce8111dacb94d06f183f173f`. Conflicts in `CONTEXT.md` and `README.md` were resolved
  against the production doctrine contract. Duplicate Checkpoint 2 commits `1c006eb` and `f5c7e14` are
  not ancestors; canonical `30de150` remains in history.
- Deleted the report-owned evidence bundle and reshaping assumptions. `planReport` now accepts the real
  engine `CalculationBundle` and doctrine `ResolvedEvidenceBundle` exports directly. A compile-time
  contract fixture covers claims/themes, classifications/review state, section/safety fields, source
  references and branded IDs, actions, suppressions, traces, and reproducibility identity. Plan APIs and
  output preserve branded fact/rule/source/action IDs and complete content/rule/source metadata.
- Corrected registry suppression semantics. A matching rule's nonempty target list no longer removes the
  rule itself; selected suppressors remove matching target IDs, the highest-confidence/rule/fact order is
  deterministic, and a suppressed suppressor cannot suppress another winner. Focused tests cover no
  exclusions, one target, multiple targets, unmatched targets, competing suppressors, chains, and
  contradictory rules.
- Enforced `maxClaimsPerTheme` after a total deterministic rank (score, mandatory status, theme, branded
  rule/fact IDs, text, claim ID) independently per theme. Zero, one, exact boundary, overflow tie,
  cross-theme, section boundary, timing/root share, valence-run, action-capacity, and mandatory-conflict
  behavior have focused tests.
- Replaced the 1,160-line planner with an 80-line orchestrator and responsibility owners for boundary
  validation, ranking, selection, contradictions, action/section allocation, audit trace propagation,
  serialization, durable validation, CLI, and reviewer rendering. Report imports recursive freezing only
  from `@numerology/shared`; no package-local freezer or evidence adapter remains.
- Added doctrine-owned immutable section/profile editorial catalogs and made section keys a compiled
  enum. Added the production `report synthetic-plan` CLI with atomic canonical JSON, reviewer Markdown,
  documented flags/exit 0–3 behavior, committed valid/invalid policy fixtures, and byte-stable JSON and
  Markdown outputs. CLI help, JSON/Markdown byte comparison, invalid exit 3, and output-path smoke passed.
- Added a real package-export end-to-end test through `calculateBundle -> DoctrineRegistry.resolve ->
  planReport`. It asserts evidence identity, fact/calculation traces, source propagation, suppression,
  contradiction preservation, per-theme caps, ordering, hashes, immutability, and stable serialization.
- Quality gates passed without threshold changes: report **95.20% branch coverage** (377/396) and
  **90.30% mutation score** (268 mutants; 235 killed, 7 timeout, 23 survived, 3 no-coverage); doctrine
  **96.62% branch coverage** (430/445) and **93.28% mutation score**; engine mutation remained
  **90.60%**. `pnpm verify` and `pnpm verify:container` both passed lint/format, migration drift,
  all workspace typechecks/tests, engine/doctrine/report fixture, coverage and mutation gates, formula
  sign-off, doctrine release check, PostgreSQL integration where applicable, and the production Next build.
- `pnpm install --frozen-lockfile`, report fixture/E2E suites, deterministic release/plan rebuilds, CLI
  smoke, and `pnpm --filter @numerology/report pack --dry-run` passed; the dry-run tarball was removed.
  Actual Docker/Compose commands could not run because this WSL distro has no `docker` command and says
  Docker Desktop WSL integration is disabled. No daemon was modified; the complete container-equivalent
  suite passed. No remote operation was performed.

## Checkpoint 4 production checklist and evidence

### 2026-09-01

- Canonical setup: created `fm/numerology-checkpoint-4-production` directly at integrated Checkpoint 3
  commit `e6557270978b2a31935350047fe86c2325e6e7c1`. Canonical Checkpoint 2 (`0dc5f35`,
  `a541cc9`, `30de150`), doctrine (`6c0c497`, `1edde24`), planner (`999482f`), and integration
  (`e655727`) commits are ancestors exactly once; no earlier history was recreated or transplanted.
- Scope evidence reviewed before implementation: the complete repository inventory and real Checkpoint 3
  planner/registry APIs and tests; `CONTEXT.md`, root/package READMEs, ADRs, migration and package
  manifests; build-bible Sections 6, 10, 12–15, 19, 30–31, 39–40 and the Checkpoint 4 dependency
  graph/acceptance surface; research documents 15–17 and 20; `input.schema.json`, `safety-policy.yaml`,
  and the existing engine/doctrine/report fixtures. Checkpoint 11, not Checkpoint 4, remains the owner of
  complete native-language launch QA; Checkpoint 4 creates the 20/20/20 frozen eval-subject corpus and
  keeps the first executable fallback fixture explicitly `en-IN` without claiming Hindi/Odia release.

### Requirement traceability and validation evidence

- [x] **Strict canonical report and version/reproduction contract** — report-owned Zod schemas, branded
  report/claim/section identifiers, strict durable parser, canonical serializer/hash and compatibility
  fixtures in `packages/report/src/{ids,structured-report,report-serialization}*`; package contract,
  malformed/unknown-key/version/tamper tests; schema fixture and dry-run package evidence.
- [x] **Deterministic permanent fallback writer** — cohesive template/localization and block-building
  modules consuming only the real `ReportPlan`, `CalculationBundle`, and `ResolvedEvidenceBundle`; all
  six specified block types, 18 mandatory sections, truthful scientific-status framing, methodology,
  actions, source/fact/rule/trace linkage, immutable output; focused boundary/determinism/ordering tests.
- [x] **All fail-closed verifier gates and diagnostics** — schema, numeric, fact linkage, rule/source,
  school boundary, contradiction, completeness, genericity, language, safety, similarity, and PII owners
  under `packages/report/src/verification/`; stable ID-only diagnostics and record/hashes; one positive
  golden plus focused invented number/source/profile/safety/PII/prompt-injection and every-gate negative
  fixture.
- [x] **Authoritative end-to-end public path and artifacts** — committed fallback doctrine release,
  one complete canonical JSON report, verification record, deterministic reader HTML, internal
  `report generate`/`report verify` CLI and exact rebuild check through `calculateBundle ->
  DoctrineRegistry.resolve -> planReport -> deterministic writer -> verifier`; CLI exit/atomic-output,
  byte-stability, full expected bundle/evidence/plan/report/verification E2E tests.
- [x] **Frozen evaluation corpus** — 60 synthetic, non-customer subjects (20 each `en-IN`, `hi-IN`,
  `or-IN`) balanced across required roots/Masters/compounds, name lengths/scripts, current-name, Lo Shu,
  timing, safety and injection edges; strict corpus parser, uniqueness/distribution/boundary tests. Native
  locale realization/promotion remains explicitly Checkpoint 11 scope.
- [x] **Checkpoint 4 persistence and immutability** — reviewed migration/Drizzle schema for fixture-only
  non-payable orders, versioned encrypted report snapshots, entitlements, and append-only job attempts;
  application persistence port and PostgreSQL adapter; explicit local/test-only synthetic ready-report
  seeder; migration/catalog, encryption canary, immutable-version, duplicate-version, ownership,
  transaction rollback and production-guard tests.
- [x] **Synthetic reader/operator/reviewer surface** — production-denied
  `GET /__fixtures/reports/{id}`, responsive accessible report shell with every semantic block and
  methodology appendix, no-store/noindex behavior, deterministic standalone renderer, reader semantic/
  keyboard/a11y assertions and built-app HTTP smoke.
- [x] **Production quality gates** — add all production modules to ordinary typecheck/test/fixture/E2E,
  >=95% report branch coverage and >=90% report mutation scope without exclusions that hide new logic;
  full `pnpm verify`, `pnpm verify:container`, deterministic clean rebuild, CLIs, PostgreSQL integration,
  package dry-runs, Docker attempt only if available, and clean branch evidence recorded quantitatively.

### Completed validation evidence

- `pnpm verify` and `pnpm verify:container` passed all workspace quality, fixture, coverage, mutation, release, integration, and web-build gates.
- Report quality: 96 tests; 95.16% branch, 97.64% statement, and 96.95% function coverage; 94.62% mutation score against the 90% break threshold.
- Canonical fixture: 13 claims, 18 sections, 12 gates; report hash `sha256:a43215a833849904ba591c00fd22abbd6ddbf00eb57f3c5537b39560dbdb3fac`; doctrine release hash `sha256:8b1444cb66909b8cc90df7ca3203a8fc7bf456e00f7cd2cb9d2e4617b6903ac6`.
- PostgreSQL 17.11 persistence tests and Next.js 16.3.3 production build passed. Docker was unavailable and no remote operation was performed.

### 2026-09-03 — post-audit correction log

- Dependency repair was limited to this exact worktree's derived package links: the Windows-invalid
  Linux reparse target under `packages/shared/node_modules/typescript` was diagnosed and repaired by a
  frozen-lockfile filtered install with scripts disabled. No source or broad dependency directory was
  removed; the repaired links are readable by Windows Node.
- TDD RED → GREEN: doctrine registry now fails closed for `confidence: "low"` with the explicit
  `LOW_CONFIDENCE` omission code. The focused doctrine registry tests (84 tests) and doctrine typecheck
  pass; low-confidence evidence cannot reach report planning.
- TDD RED → GREEN: report verification now checks editorial prose against an independent, frozen
  approved-copy registry rather than the writer's sentence generator. The new public-boundary test
  mutates a rendered editorial sentence and receives `REPORT_EDITORIAL_SENTENCE_NOT_APPROVED`.
- Deterministic fallback copy was corrected from repeated marker padding to section-lensed, staged
  prose. Reader-facing tests assert meaningful section language and reject the former boilerplate marker
  phrase; canonical report, verification, and HTML fixtures were regenerated by the release checker.
  The canonical fixture now records 15 claims, 18 sections, 15 gates, and report hash
  `sha256:bc83ba0c32ebbdbbbd280e84308fe0ed415eb3264285ae31fbe943af04e6760f`.
- The executable 60-subject evaluation now composes each referenced engine vector into a complete,
  deterministic Checkpoint 4 request (full profile catalog, required name views, vector date/name edge,
  and a display-only audit value); adversarial rows reach safety/script gates. Results are 7 verified,
  13 rejected (8 precise insufficient-claim rejections and 5 adversarial rejections), and 40 explicitly
  unsupported native-locale rows. Each English row has a distinct non-null engine input hash. The
  expected matrix and tests assert these counts, IDs, diagnostics, and hash variation.
- Fresh focused report verification after these corrections: `pnpm --filter @numerology/report test`
  passed 14 files / 100 tests; report typecheck and focused doctrine typecheck passed. The full root
  `pnpm verify` quality/coverage/mutation/build gate must be rerun after this correction set; historical
  pre-correction full-gate numbers above are retained as historical evidence only.
- TDD RED → GREEN: the customer delivery seam now projects a verified structured report into a strict,
  frozen customer DTO containing only readable title/name/locale/disclaimer, section copy, chart values,
  comparison labels, timeline values, and source-note editorial body. It drops report/claim/fact/rule/
  source/trace identifiers, confidence/ranking, versions, hashes, and verifier records. The customer
  HTML renderer accepts only that projection (not the internal report) and uses generated section anchors.
  `pnpm --filter @numerology/report exec vitest run src/customer-delivery.test.ts` passed 2/2; the web
  reader test passed 3/3 after switching the synthetic reader to this boundary. The internal renderer
  remains available for reviewer fixtures only.
- TDD RED → GREEN: removed the deterministic report schema's required `model` and `prompt` fields,
  which incorrectly implied an LLM launch dependency. Versions now require deterministic `writer` and
  `writerPolicy` identifiers; future generative metadata is not present unless a real adapter is used.
  Canonical report/evaluation artifacts were regenerated. Fresh `pnpm --filter @numerology/report test`
  passed 15 files / 102 tests, including schema, CLI, evaluation, and verifier contracts.
- Checkpoint 5 started with public contract slices. `@numerology/contracts` now strictly parses complete
  intent input and patch/draft shapes; `normalizeReportIntentInput` applies NFC-safe name handling,
  control/markup/emoji/digit rejection, real Gregorian date checks, future/18+ boundaries, and
  lowercased email lookup normalization. Red → green: 7 contract tests and typecheck pass.
- Red → green: `@numerology/application` intent commands now create/get/patch/complete encrypted drafts
  through `ReportIntentRepository` and `FieldProtector`, enforce owner/version/status boundaries,
  snapshot normalized input only after deterministic engine validation, and produce a three-value
  deterministic preview from the injected clock. The command API derives `asOfDate` from one captured
  clock value; callers cannot override it. Application tests pass 11/11 and typecheck passes.
- Red → green: signed draft cookie (opaque intent/expiry payload with HMAC and constant-time
  verification), CSRF constant-time comparison, and injected-clock in-memory rate-limit seams added;
  tampering, expiry, malformed input, window reset, and remaining-budget tests pass. Ordinary root
  verification no longer runs report mutation; `pnpm report:mutation:deep` is the explicit periodic
  report mutation command.
- TDD RED → GREEN: the framework-independent `createReportIntentRouteHandlers` adapter now requires
  a verified `report_draft` HMAC cookie for every existing-intent operation, rejects missing, forged,
  expired, or route-mismatched intent tokens before resolving ownership, and passes only the verified
  payload to the owner boundary. New-intent creation uses a separate trusted session/principal port;
  no request header is treated as identity. Strict create/patch/complete/preview bodies, CSRF, rate
  limits, optimistic conflict mapping, `application/problem+json`, no-store headers, and no-PII error
  canaries are covered. Fresh application gate: 7 files / 15 tests and typecheck pass. Thin Next route
  files remain deferred until the web session, subject, field-protector, and repository composition
  ports are available; wiring a fallback owner or real secrets here would be unsafe.
- TDD RED → GREEN: corrected report persistence after the deterministic schema removed the obsolete
  `versions.prompt` field. Reports now store `writer_policy_version` beside `writer_version`; a new
  forward migration (`0002_yummy_gambit`) backfills existing rows with an explicit legacy marker,
  makes the column required, and extends the immutable snapshot trigger. Migration drift, database
  typecheck, and the new information-schema contract compile/pass; PostgreSQL integration was
  attempted but the local WSL PostgreSQL endpoint was unavailable (`ECONNREFUSED 127.0.0.1:5432`).
- TDD RED → GREEN: customer delivery now requires a parsed, valid verification record bound to both
  the exact structured-report hash and calculation-bundle hash. Missing, invalid, mismatched, and
  failed verification records reject with `CUSTOMER_DELIVERY_VERIFICATION_INVALID`, while verifier
  metadata still remains outside the customer DTO/HTML. Fresh report customer-delivery tests pass
  3/3; report typecheck and all 4 web test files / 7 tests plus web typecheck pass.
- TDD RED → GREEN: replaced the brittle customer-copy substring sanitizer with authored safe language
  in the deterministic writer and independent approval registry. Reviewer-only method/source notes
  now project to one plain customer note; the projection rejects unexpected internal vocabulary
  instead of silently rewriting it. A boundary test scans every customer text value and protects
  against fact/rule/source/trace/version/audit/verification/hash/provenance/gate leakage. The writer's
  filler now stops at the 110% section bound when a whole approved sentence would overshoot, preserving
  the 7,500–10,000 total-word gate. Fresh report verifier, deterministic-writer, and customer-delivery
  tests pass 13/13.
- TDD RED → GREEN: report-intent completion snapshots now use strict schema `1.0.0` containing the
  normalized input and authoritative completion `asOfDate`; preview validates and reuses that stored
  date instead of the current wall clock. A clock-rollover test proves stable preview values across
  2026→2027. Fresh contracts pass 8 tests and application passes 16 tests, with both typechecks green.
- TDD RED → GREEN: corrected the report persistence migration name to the descriptive forward
  migration `0002_report_writer_policy_version.sql` (the historical `0001_checkpoint_4_report_fixture`
  bytes remain unchanged). It backfills a legacy writer-policy marker, makes
  `writer_policy_version` required, and extends the immutable-report trigger. `db:check` and database
  typecheck pass; the live PostgreSQL integration attempt remains blocked by the exact local endpoint
  error `ECONNREFUSED 127.0.0.1:5432`.
- TDD RED → GREEN: report-intent names now preserve the NFC customer display value while requiring a
  customer-confirmed, semver-versioned Latin engine spelling for non-Latin names. Engine requests
  collapse only calculation whitespace and attach the explicit confirmation metadata; Hindi/Odia
  missing-confirmation, unsafe, and digit cases are rejected. Fresh contracts report-intent tests pass
  6/6 with strict typecheck; application intent tests pass 5/5 with strict typecheck.
- TDD RED → GREEN: customer delivery separates ordinary reflective actions into `practicalAlternatives`
  and permits a `traditionalPractices` item only when provenance explicitly classifies the action as
  `traditional_practice`, binds it to a `remedy` rule type, and carries source references. The current
  corpus has no such remedy action, so the customer receives an explicit unavailable state instead of
  a fabricated remedy. Every item remains optional and promises no result; internal action IDs,
  provenance, scores, and gates stay outside the customer DTO and HTML.
- TDD RED → GREEN: HTTP errors now carry a stable problem `type`, safe correlation ID, and schema-only
  field errors; create requires CSRF and an RFC-shaped UUID idempotency key. The idempotency port is
  bound to owner, operation, canonical request fingerprint, and a 24-hour expiry: an exact replay
  returns the stored response while reuse with another body fails HTTP 409. Explicit cookie policy adds
  `Secure` only in production; the signed cookie intentionally carries no mutable draft version. The
  in-memory limiter remains test/local-only behind its injected port.
- Fresh post-correction gates: contracts 2 files/9 tests, application 7 files/19 tests, report 15
  files/104 tests, and web 4 files/7 tests all pass; contracts/application/report/database/web
  typechecks pass. `pnpm --filter @numerology/report test:fixtures`, `test:e2e`, and
  `pnpm report:release:check` pass; report release fixture is 15 claims/18 sections/15 gates with
  report hash `sha256:35d5e97483c486ccc6ce63856a8df9f99027f7d1945dade543a4f832d48b7736`.
  Biome check passes for the affected application/contracts/report/database/web source trees.
- The database endpoint issue was resolved with a bounded hidden WSL keeper process. Windows TCP 5432
  became reachable and `pnpm --filter @numerology/database test` passed 7 files / 15 tests, including
  empty migration, schema catalog, immutability, repository, transaction, readiness, and field
  protection integration. The exact helper process was then stopped. No migration bytes before
  `0002_report_writer_policy_version.sql` were modified.
- 16:41 — TDD RED: draft-cookie tests failed because the signed payload still required a mutable
  version; idempotency tests failed because the port did not bind the request body and accepted an
  arbitrary token instead of a UUID.
- 16:42 — TDD GREEN: the signed cookie now contains only opaque intent ID and expiry. Create
  idempotency uses owner + `report-intents.create` + UUID + canonical request fingerprint with a
  24-hour record contract; same-body replay succeeds without a second command and different-body key
  reuse returns `IDEMPOTENCY_KEY_CONFLICT` (409). Application passes 7 files / 20 tests.
- 16:43 — Recompiled both doctrine releases after the action-classification schema change, restoring
  canonical content/index/hash agreement. Regenerated starter plan, Checkpoint 4 report bundle/plan/
  report/verification/HTML, and the 60-subject evaluation matrix through their production CLIs.
- 16:44 — TDD GREEN: customer delivery now exposes source-backed ordinary actions as practical
  alternatives and never labels them remedies. Traditional practices require explicit doctrine
  classification plus a `remedy` rule type; absent that evidence, the customer sees the approved
  unavailable state. Focused customer delivery passes 5/5; full report passes 15 files / 105 tests,
  application/report typechecks pass, doctrine release fixtures pass 2/2, and the Checkpoint 4 release
  checker passes at 15 claims / 18 sections / 15 gates with report hash
  `sha256:f94d6bd1f99765a2ba79437d5c6e5806e5f54c216b14c171626821fe6a728686`.
- 16:47 — Sol standards re-review returned no findings. It independently passed application 20/20,
  doctrine 84/84, report 105/105, their strict typechecks, and report fixtures 3/3 while confirming
  request-bound idempotency, cookie-version removal, fail-closed remedy classification, and regenerated
  canonical artifacts. The parallel Sol spec re-review could not start because the account-wide model
  usage ceiling was reached; this is recorded as unavailable, not as a validation pass.
- 16:50 — Began a non-overlapping Checkpoint 5 web intake slice after confirming the existing web app
  contained only marketing, health, developer, and synthetic report fixture routes. The slice is
  intentionally UI-only until a real authenticated/session-backed composition exists; it does not
  invent an owner, database repository, CSRF secret, or API response.
- 16:51 — TDD RED: added focused tests for a browser resume marker and localized intake rendering;
  both failed at the absent progress codec/form seams. The tests require strict marker keys and reject
  PII-shaped fields, malformed values, unsupported locales/steps, and markers older than 24 hours.
- 16:55 — TDD GREEN: implemented the `IntakeForm` client boundary with native name/date/email/consent
  controls, localized English/Hindi/Odia copy, review and preview handoff states, accessible progress
  navigation, explicit scientific/privacy language, and session-only autosave of `{locale, step,
  savedAt}`. No name, date of birth, email, report ID, verifier field, confidence, ranking, hash, or
  provenance value is written to browser storage.
- 16:58 — Added private, non-indexable `/[locale]/intake` and opaque UUID-gated
  `/[locale]/intake/[intentId]/[step]` route shells. The route parser rejects path traversal,
  arbitrary IDs, unsupported locales, and unsupported steps; it performs no identity lookup and
  therefore cannot disclose another customer's draft.
- 16:59 — Web validation GREEN: focused intake/route tests passed 8 tests; full web suite passed
  8 files / 18 tests; web strict typecheck passed; Biome check passed; `pnpm --filter
  @numerology/web build` passed and emitted both dynamic intake routes. The API-backed create/save/
  complete/preview wiring remains a parent-owned follow-up once session, subject, CSRF, field-protector,
  and repository composition are available.
- 17:01 — Hardened the browser marker to canonical UTC ISO timestamps, deterministic test clocks,
  a strict 24-hour expiry window, and a static locale set; corrected copy to describe the actual
  `sessionStorage` lifetime (browser session rather than device-wide persistence). Intake tests now
  pass 9/9 and web typecheck remains green.
- 17:02 — Re-ran the optimized Next production build after the hardening pass; it remains GREEN and
  emits `/[locale]/intake` plus `/[locale]/intake/[intentId]/[step]` as dynamic routes.
- 16:49 — Checkpoint 5 analytics TDD RED: the focused test could not import the absent pre-payment
  analytics boundary. The acceptance contract rejects arbitrary answer/value/name/email/date fields,
  requires affirmative optional-analytics consent, and assigns ID/time/90-day expiry server-side.
- 16:50 — Checkpoint 5 analytics application GREEN: a strict discriminated allowlist now accepts only
  `landing_viewed`, `intake_started`, `intake_step_completed`, `intake_reviewed`, and `preview_viewed`
  with bounded enums/version identifiers. Unknown event/property keys fail closed and declined consent
  writes nothing. Application passes 8 files / 23 tests and strict typecheck.
- 16:54 — Checkpoint 5 analytics persistence GREEN: forward migration
  `0003_checkpoint_5_prepayment_analytics.sql` adds the pseudonymous, append-only event table, event-name
  enum, JSON property allowlist constraint, exact 90-day retention constraint, expiry/funnel indexes,
  and no principal/intent/content columns. Direct SQL carrying an email property fails constraint
  `23514`; update/delete fail append-only SQLSTATE `55000`. Full live PostgreSQL acceptance passes 8
  files / 17 tests, focused migration/schema/repository acceptance passes 3 files / 7 tests, Drizzle
  migration drift and application/database strict typechecks pass, and the exact WSL keeper was stopped.
- 17:03 — Privacy-consent TDD RED → GREEN: the strict intake contract now models optional analytics
  consent separately from marketing and defaults both to false. Completion creates required-processing,
  analytics, and marketing evidence with notice version/locale/action/time, and the PostgreSQL adapter
  writes all three in the same transaction as the immutable completion snapshot. Forward migration
  `0004_checkpoint_5_optional_consent.sql` adds explicit `analytics` purpose and `declined` action.
  Live PostgreSQL acceptance passes all 8 files / 17 tests, including exact notice evidence and rollback/
  immutability behavior; contracts pass 2 files / 10 tests, application 8 files / 23 tests, Drizzle
  migration drift and strict typechecks pass, and the exact WSL keeper was stopped.
- 17:14 — Checkpoint 5 web correction TDD RED: new policy tests exposed that the intake shell needed an
  independently understandable privacy notice (controller/contact, required data/purpose, processor
  categories/locations, delivery, seven-day draft retention, rights/correction/erasure/export/grievance,
  breach contact, and the 18+ rule), explicit non-persisted browser behavior, a stable adult boundary,
  separate required/analytics/marketing controls, and non-Latin/Y name-policy branches. The first
  implementation also surfaced strict TypeScript errors where name-policy confirmation fields were
  incorrectly spread into `IntakeValues` and optional Y values were assigned as explicit `undefined`.
- 17:17 — Checkpoint 5 web correction TDD GREEN: `privacy-notice.ts` now carries versioned, itemized
  disclosure text and a pre-production contact warning; `intake-validation.ts` validates real civil
  dates against an injected `asOfDate`, rejects under-18 subjects, and exposes explicit Latin-spelling
  and contextual-Y predicates. `IntakeForm` now keeps name-policy state in its own strict seam, renders
  all three consent controls with optional controls unchecked, shows age errors without wall-clock
  hydration drift, and states that this unconnected UI neither submits nor saves answer values. Added
  focused privacy, validation, and branch tests; focused intake suite passes 5 files / 14 tests.
- 17:18 — Accessibility correction TDD RED → GREEN: Biome rejected generic `role="group"` wrappers for
  the conditional spelling panels. Replaced them with labelled semantic fieldsets and added responsive
  styles for spelling/Y panels, radio choices, age errors, and the expanded notice. Visible intake
  strings for back/start-over, sidebar eyebrow, privacy labels, breach text, and no-JS messaging are
  localized across English, Hindi, and Odia; no-JS copy makes no native-submit/fallback claim.
- 17:20 — Deep-link safety correction: the opaque `[intentId]/[step]` route now always starts at the
  earliest name question and disables session-marker resume until a secure draft loader can verify
  ownership and prior-step completion. A focused route test proves a preview URL does not render the
  preview state with empty local values. Full web suite passes 11 files / 27 tests; web typecheck,
  `pnpm exec biome check apps/web/src`, and `pnpm --filter @numerology/web build` pass. The web slice
  remains UI-only; API create/save/complete/preview composition remains deferred pending real session,
  subject, CSRF, field-protector, and repository ports.

## Checkpoint 3 doctrine production evidence

### 2026-09-01

- Created `fm/numerology-cp3-doctrine-production` from exact finalized Checkpoint 2 commit
  `30de150dcf2fb19e1f0a7067f521971ab590569d`, then transplanted only preserved doctrine commit
  `1cc917c745d18174be2a0d5d570c0e6b870a7ebe`. Verified duplicate Checkpoint 2 commits `f5c7e14`
  and `1c006eb` are not ancestors. The sole transplant conflict was this ledger; corrected canonical
  Checkpoint 2 evidence was retained rather than taking the stale parent history.
- Replaced the preserved doctrine's independently invented atomic TypeScript schema with executable
  draft-2020-12 compilation of canonical `data/rule.schema.json`. Runtime normalization retains every
  canonical property, including rule/review/claim classifications, reviewers, prohibited phrases,
  validity dates, sources, and content hash. Compile-time complete field maps plus schema property/enum
  parity tests prevent drift.
- Decomposed the former 722-line compiler into canonical ingestion, release model, semantic validation,
  normalization, content hashing, indexing, diagnostics, compilation/emission, semantic diff, viewer,
  and CLI owners. The compiler is now 169 lines; deterministic release hash is
  `sha256:662771c3ea88defd3183abfb6a80713f6c90cd3b7c8d5bb1e40dbaa6f94368cb`.
- Added branded fact/rule/source/action IDs at parse/validation boundaries and propagated them through
  calculation bundles, indexes, registry maps, resolved evidence, suppressions, traces, reviewer rows,
  and semantic diffs. Added `packages/shared` as the sole recursive `deepFreeze` implementation and
  removed all numerology/doctrine copies; focused nested, symbol, shared-reference, and cycle tests pass.
- Exported immutable `ResolvedEvidenceBundle` as the sole doctrine-to-report boundary. It includes
  claims/themes, claim class/rule type, review state/reviewers, section/safety data, source IDs/locators,
  resolved actions, calculation traces, content/validity metadata, omissions, suppression relationships,
  and complete release/engine/formula/input/calculation reproducibility hashes. `suppressesRuleIds` and
  suppression records explicitly identify target IDs suppressed by the matching rule; they never discard
  the matching rule itself. No report planner was added.
- Added documented `validate`, `compile`, `diff`, `synthetic-plan` (evidence only), and `review` CLIs with
  deterministic JSON/Markdown, atomic file outputs, useful exit 1/2/3 failures, valid/invalid release
  fixtures, and a practical filtered reviewer table. CLI smoke passed validation, expected invalid exit
  3, byte-identical compilation/manifest, empty self-diff, one-evidence synthetic resolution, and viewer
  rendering. `pnpm doctrine:release:check` passed committed byte-for-byte rebuild and synthetic smoke.
- Doctrine focused verification passed 76 tests across eight files plus two committed-release fixture
  tests. V8 coverage passed at **97.91% branches** (423/432), above the 95% gate. Stryker passed at
  **93.28% mutation score** (458 killed / 491 scored mutants) across canonical schema ingestion,
  declarative trigger evaluation, content-hash validation, and branded ID boundaries, above the 90% gate.
- Complete `pnpm verify` passed frozen schema/format/lint, migration drift, all eight package typechecks,
  212 repository tests across 37 files including PostgreSQL 17 integration, engine/doctrine fixture
  gates, engine **96.62% branch coverage** and **90.60% mutation score**, refreshed formula sign-off after
  the freezer-only import refactor, doctrine coverage/mutation/release gates, and Next production build.
  `pnpm verify:container` independently passed the no-database container-stage equivalent with the same
  quality thresholds and production build.
- `pnpm install --frozen-lockfile` passed. `pnpm pack --dry-run` passed for doctrine, doctrine-data,
  engine, and shared; generated dry-run tarballs were removed. Actual `docker info`/image build could not
  run because this WSL distro reports Docker integration unavailable; no daemon was modified. The
  complete container-equivalent verification above passed without weakening any gate.

## Source review register

### Governing and product documents

- `../research/technical-build-bible.md` — complete technical build sequence and Checkpoint 1 contract.
- `../deliverables/numerology-platform-technical-build-bible.docx` — rendered build-bible artifact.
- `../definitive-numerology-platform-blueprint.docx` — authoritative domain/product reference.
- `../research/20-final-product-specification.md` — V1 product boundaries and report contract.
- `../research/16-data-model.md` — domain entities and data relationships.
- `../research/17-test-dataset.md` — independent domain test vectors.
- `../data/input.schema.json`, `../data/rule.schema.json` — source data contracts.
- `../data/formula-registry.yaml`, `../data/safety-policy.yaml` — calculation and safety policy sources.
- `CONTEXT.md`, `README.md`, `docs/adr/*.md` — repository vocabulary and architectural decisions.

The workspace contains the complete research corpus (`../research/01-*` through `../research/21-*`),
derived CSV/JSONL/YAML datasets, document builders, QA output, the two DOCX artifacts, and this platform
repository. Relevant implementation details are revalidated against those sources before each slice.

## Accepted decisions

### Product and trust

1. V1 sells one ₹499 personalized report to India-first customers.
2. Numerology is reflective guidance, not medical, legal, financial, or deterministic life advice.
3. Deterministic code performs every calculation, evidence lookup, report planning, writing, remedy
   selection, verification, and delivery at launch. An AI/LLM is not required for the product to work;
   any future generative adapter is optional and cannot bypass the deterministic verifier.
4. Incompatible numerology traditions remain explicit and are never averaged.
5. Every launch report must be reproducible from immutable input, engine, doctrine, planner, writer,
   writer-policy, verifier, renderer, safety-policy, and locale-pack versions. Prompt/model metadata is
   recorded only if a future optional generative adapter actually participates.

### Architecture

1. One strict TypeScript pnpm monorepo; domain packages depend on no framework or infrastructure SDK.
2. Separate deployable web and worker processes share contracts, with the worker added in Checkpoint 7.
3. PostgreSQL 17 is the system of record; Cloud Tasks is the launch queue; large artifacts use private
   object storage.
4. Launch data plane is Google Cloud Mumbai (`asia-south1`) with portable Docker/PostgreSQL boundaries.
5. The application layer owns use cases and ports; database and provider packages are adapters.
6. Sensitive fields use envelope encryption. Equality lookup uses a separate keyed HMAC; ciphertext is
   never treated as searchable data.
7. Browser redirects never grant paid access; only verified server-side payment events may do so.

### Checkpoint 1 scope

1. Build `packages/application` ports for clock, IDs, transactions, and field encryption/HMAC.
2. Build `packages/database` with Drizzle schema, migrations, repositories, and a PostgreSQL test harness.
3. Create only: `principals`, `sessions`, `access_challenges`, `subjects`, `name_uses`, `report_intents`,
   `consent_events`, `audit_events`, and migration metadata. Orders/reports remain deferred.
4. Persist resumable report intents and immutable intake snapshots.
5. Use optimistic concurrency; conflicting concurrent updates expose one domain conflict mapped to HTTP
   409 at the delivery boundary.
6. Split `/api/health` liveness from database-backed readiness. Readiness performs a bounded, sub-100 ms
   probe and fails safely without exposing internals.
7. Provide expiry cleanup, synthetic fixtures, restore instructions, and pool-cap configuration.
8. No public endpoint echoes personally identifiable information.
9. Drizzle schema files are the code model and committed SQL migrations are the deployment history;
   `drizzle-kit push` is not an application or CI migration path.
10. The local field protector uses per-value AES-256-GCM data keys wrapped by a local AES-256-GCM key;
    lookup HMAC uses an independent key and purpose/version domain.
11. The default process pool maximum is five connections until the Cloud Run instance budget is known.

## Confirmed TDD seams

These seams come from the approved build bible and repository boundaries and are the only interfaces
tested directly in Checkpoint 1:

1. **Application ports:** `Clock`, `IdGenerator`, `TransactionRunner`, `FieldProtector`.
2. **Migration command:** migrate an empty PostgreSQL 17 database to the current schema.
3. **Report intent repository:** create, retrieve, update by expected version, and expire through its
   public repository interface.
4. **Encryption adapter:** protect/reveal confidential values and derive stable, domain-separated lookup
   HMACs; wrong keys fail closed.
5. **Health HTTP contract:** `/api/health/live` and `/api/health/ready` response status/body only.
6. **Cleanup command:** delete or redact expired private records through an application command.

Mocks/fakes are allowed only at system boundaries: time, IDs, encryption key material, and database
availability. Integration behavior uses a real PostgreSQL 17 instance.

## Built artifacts

### Checkpoint 0 — complete

- pnpm workspace with `apps/web`, `packages/contracts`, and `packages/numerology`.
- Strict TypeScript, Biome, Vitest, lockfile, CI workflow, Dockerfile, PostgreSQL Compose service, and
  Cloud Build skeleton.
- Environment validation contract and tests.
- Deterministic `digitalRoot` primitive with auditable trace and seven tests.
- Editorial responsive landing page and health endpoint.
- Architectural context and ADRs 0001–0005.

### Checkpoint 1 — complete

- Durable progress/decision/evidence ledger and accepted ADR 0005.
- `packages/application`: clock and random-ID ports, transaction port, purpose-bound field-protection
  port, version-1 local envelope adapter, validated local-key construction, report-intent repository
  contract/errors, and the expiry-cleanup command.
- `packages/database`: Drizzle model, reviewed SQL migration, migration runner, capped PostgreSQL pool,
  one-client transaction runner, bounded readiness probe, optimistic report-intent repository, catalog
  verifier, and guarded synthetic integration harness.
- PostgreSQL 17 schema with eight business tables plus `schema_migrations`; composite ownership keys,
  lifecycle checks, lookup/expiry partial indexes, append-only event triggers, and immutable completion
  snapshot trigger. Orders/reports were intentionally not created.
- Encrypted draft create/resume/update/complete/expire behavior with a separate purpose-bound lookup
  HMAC. Raw persistence tests prove supplied confidential canaries are absent.
- `/api/health/live`, `/api/health/ready`, and local/test-only `/dev/readiness`; the old combined health
  route was removed.
- PostgreSQL 17.11 Compose/CI service definitions, test-database initializer, local key fixtures,
  package/root run instructions, and a guarded logical restore drill/runbook.
- Container-stage verification excludes only database integration tests; CI/full local verification
  runs those tests against a real PostgreSQL 17 service before the production build.

## Verification history

### Checkpoint 0 release verification

- `pnpm verify` passed: lint, formatting, strict type checks, 9 tests, and production Next.js build.
- Browser QA passed at desktop and mobile widths; no horizontal overflow or console errors.
- Health endpoint returned HTTP 200 and the documented contract.
- Docker image build was not run because Docker Desktop was unavailable on the host.

### Checkpoint 1 release verification

- `pnpm verify` passed: Biome lint/format, Drizzle journal drift, all strict type checks, 29 tests in 14
  test files, and a production Next.js build.
- Database acceptance passed on PostgreSQL 17.11: empty migration, exact table set, catalog objects,
  append-only/immutable constraints, rollback, encrypted persistence, no-plaintext canary, optimistic
  concurrency, completion, expiry cleanup, healthy and unavailable readiness.
- Built-app HTTP QA passed for live, ready, unavailable, developer fixture, production fixture denial,
  and legacy-route removal.
- Logical backup/restore validation passed with nine restored tables and one migration; temporary
  artifacts were verified removed.
- `pnpm verify:container`, standalone runtime startup, restore-script syntax, and
  `docker compose config` passed.
- The Docker image itself could not be executed because Docker Desktop 4.75 is unavailable on this
  host. This is an environment-only exception: the Dockerfile dependency graph and standalone runtime
  were verified, but an actual `docker build` remains to run when the daemon is repaired.

## Checkpoint 1 completion checklist

- [x] Complete source/schema review and freeze the Checkpoint 1 relational model.
- [x] Add package dependencies and database/application package scaffolds.
- [x] Run each application-port and encryption slice red → green.
- [x] Run migration/schema slices against PostgreSQL 17 red → green.
- [x] Implement report-intent persistence and optimistic concurrency red → green.
- [x] Implement expiry cleanup red → green.
- [x] Split liveness/readiness and add safe-failure HTTP tests red → green.
- [x] Add synthetic seed fixtures and restore/run instructions.
- [x] Run schema-drift, plaintext-canary, rollback, and concurrency verification.
- [x] Run the full repository verification and Checkpoint 1 acceptance gate.

## Risks and blockers

- Docker Desktop 4.75 cannot start because its stale `dockerInference` runtime socket cannot be removed
  under host policy. PostgreSQL 17.11 runs directly in Ubuntu WSL, so database/application verification
  is complete. Re-run `docker build -t numerology-platform:checkpoint-1 .` after repairing the daemon.
- Encryption format and key identifiers become long-lived compatibility contracts. Version every
  ciphertext envelope from the first migration.
- Pooled serverless connections can exhaust a small Cloud SQL instance. Keep explicit pool ceilings and
  short transactions.

## Decision change log

- No Checkpoint 0 decision has been reversed.
- Orders, payments, reports, queues, model calls, and production cloud provisioning remain out of scope
  for Checkpoint 1.
- ADR 0005 fixes the first ciphertext envelope at version 1 and the initial migration strategy.
- UUIDv4 is the first ID adapter because the contract permits UUIDv7 or 128-bit random IDs and no
  Checkpoint 1 query depends on temporal ordering.
- Database runtime exports have explicit subpaths so delivery code cannot accidentally bundle migration
  filesystem behavior.
- Docker image construction uses `verify:container`; the PostgreSQL integration suite remains mandatory
  in CI/full verification, where a service database exists.
