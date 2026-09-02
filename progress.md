# Numerology Platform Progress

This is the durable implementation ledger for the platform. Update it whenever a decision is made,
a TDD cycle changes state, an artifact is built, a verification command runs, or a blocker is found.
Times are India Standard Time (UTC+05:30).

## Current status

- Current checkpoint: **Checkpoint 4 — Report contract, deterministic writer, and verifier**
- State: **Checkpoint 4 productionized and fully verified on canonical integrated Checkpoint 3**
- Started: 2026-09-01 22:55 IST
- Governing specification: `/mnt/d/numerology app/research/technical-build-bible.md`, Checkpoint 4 and Sections 6, 10, 12–15, 19, 30–31, 39–40
- Last completed checkpoint: Checkpoint 3
- Production traffic: prohibited until Checkpoint 13 release gates pass

## Live progress log

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
3. Deterministic code performs every calculation; a language model may only plan or express supported
   findings in later checkpoints.
4. Incompatible numerology traditions remain explicit and are never averaged.
5. Every report must be reproducible from immutable input, engine, doctrine, prompt, model, and locale
   versions.

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
