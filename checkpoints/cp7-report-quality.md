# Checkpoint 7: deterministic report quality and release policy

Status: ENGINEERING COMPLETE — evaluated release quality remains blocked.

## Specification reconciliation

User authorized a narrow build-bible lookup and worker/outbox test seams. The actual detailed CP7
section is "Model writer and report quality evaluation"; its worker checkpoint is CP9, conflicting
with ADR 0001's CP7 worker reference. The newer user no-LLM direction and ADR 0006 supersede the
model requirement. The user's renewed "CP6 IS COMPLETE LETS GET DONE WITH CP 7 NOW" follows the
deterministic scope proposal and confirms proceeding with it. CP7 preserves evidence-bounded
deterministic writing, synthetic evaluation, strict release gates, human rubric and promotion/rollback
checks. Worker/outbox delivery stays CP9; payment correctness stays CP8. No optional future chat,
provider adapter, model metadata tables or model credentials will be added speculatively.

## Owned interfaces and invariants

- Extend the synthetic report evaluation CLI with a release-quality assessment, not a customer
  endpoint. Ordinary CLI execution success must remain distinct from eligibility to promote.
- Use a strict, content-bound deterministic evaluation artifact: frozen corpus identity, doctrine
  release identity, writer/policy/version identity and per-subject expected/actual outcomes.
- Ordinary subjects must yield verified reports; adversarial subjects must be rejected by the
  relevant safety/provenance/locale checks, not merely by unrelated exceptions. Unsupported locales
  never count as passing or disappear from requested-locale denominators.
- Keep critical correctness at 100%, overall automated acceptance at least 98%, and native-review
  mean at least 4.2 with no dimension below 4.0. Factual/safety human flags are automatic failures.
  Missing native review is a blocker, not a fabricated score or agent-native-review substitute.
- Promotions bind to exact assessed artifacts and requested locales. Rollback only selects an
  explicitly eligible prior artifact; no silent model fallback or external deployment changes.
- No model credentials, prompts, token/cost tables or customer data are needed for this checkpoint.

## Verified baseline and remaining work

Existing 60-case corpus has 20 subjects per locale. `runEvaluationCorpus` returns 7 English verified,
8 ordinary English claim-cardinality failures, 5 English adversarial rejections and 40 unsupported
Hindi/Odia cases. The current `report evaluate` command exits 0 when evaluation completes, even
when reports are not release-ready. Its snapshot test is regression evidence, not promotion approval.
Existing generation and 15 verifier gates stay authoritative. CP7 must expose these quality gaps
without weakening report cardinality, locale or safety protections. Real native reviews/content-pack
coverage remain release dependencies if not supplied.

Original corpus-wide overlap and glossary adherence metrics are unassessed: the existing verifier's
similarity comparison uses a synthetic reference passage, not all corpus peers; script checks do not
measure glossary adherence. Expose both as explicit release blockers until corresponding measured,
version-bound checks exist. Tooling completion cannot claim those product-quality criteria passed.

Confirmed tests: public synthetic quality CLI and release-policy interface, including malformed,
missing/stale/mismatched artifacts, ordinary failure versus expected adversarial rejection, native
review absence/failure and promotion/rollback selection. Use a coarse contract suite, red before
green; retain the existing snapshot corpus regression suite and all independent verifier gates.

## Completion boundary

Software acceptance requires fail-closed assessment/promotion/rollback contracts, operator
documentation, full repository verification and independent Sol review. Native-language quality
approval and complete doctrine/locale coverage are separate launch gates; missing evidence must stay
explicitly blocked. A tooling implementation does not certify the current report corpus for sale.

## Established decisions (existing accepted ADRs)

- ADR 0001 introduces a separately deployable worker at Checkpoint 7, in the same TypeScript
  monorepo and revision as the web process. Domain modules remain framework/provider independent.
- ADR 0003 makes PostgreSQL the business-state authority and Cloud Tasks the delivery authority.
  An application outbox closes the commit/enqueue gap. The relay uses deterministic task names and
  the private worker receives only an opaque report ID. Delivery is idempotent; PDFs do not go in SQL.
- ADR 0004 places the primary Cloud Run/Cloud SQL/Cloud Tasks/Cloud Storage data plane in Mumbai
  (`asia-south1`). Provisioning external infrastructure is not authorized by local implementation.
- ADR 0006 makes the entire launch report pipeline deterministic. No AI/LLM runtime is required.

## Current implementation constraints

- `ReportGenerationRepository` only creates and retrieves complete ready synthetic fixtures.
  `reports` requires encrypted input/calculation/evidence/plan/report snapshots, hashes, version
  bindings, verification and readiness timestamps. Existing snapshot immutability must stay intact.
- `orders` explicitly permits only non-payable zero-value fixture orders. Do not silently remove that
  protection, treat intake completion as payment, or grant new entitlements during worker scaffolding.
- `job_attempts` is append-only evidence, not a mutable queue or lease table.
- The shared PostgreSQL transaction runner handles rollback and damaged connections. Reuse it.
- CP6 customer delivery and session/entitlement enforcement remain regression requirements.

## Work status

- Clean CP6 baseline: `8525680`, pushed to `github/main`.
- Read only current handoff, relevant accepted ADRs and report-generation/persistence contracts.
- Refreshed the scoped code graph; existing persistence cannot be assumed to support pending jobs.
- Implementation crew: Luna extra-high for the quality module; primary agent for CLI/docs;
  Sol for independent validation and a correction loop. No cloud provisioning or live deployment.
- Added `assessReportQuality`, strict artifact/assessment parsers, native review sealing and reviewer
  packets, plus replay-based `decideRelease`. Artifacts bind corpus, doctrine, engine/formula manifest,
  planner, writer, locale, renderer, safety and verifier versions. Self-hashed summaries are not
  authorization; promotion/rollback replays the exact candidate and requested locales.
- Added `report quality` and `report release-decision`. Exit 4 means valid but blocked; invalid input,
  usage and I/O remain distinct. Reviewer packet output is atomically paired, excludes rejected and
  adversarial bodies, rejects non-file/symlink targets and recognizes equivalent output paths.
- Contract TDD produced 22 quality-policy and 19 quality-CLI tests. Existing evaluation output stays
  byte-compatible. Report suite: 178 tests, 98.04% lines and 95.05% branches.
- Independent Sol validation passed 64 focused tests after a correction loop closed forged rollback,
  parser round-trip, native locale/coverage and mixed-diagnostic issues. No actionable finding remains.
- Full `pnpm verify` passed: 530 package/database tests plus one tooling test, schema check, formula and
  doctrine release checks, coverage gates and production web build. Graphify passes with 1,598
  extracted nodes and 4,834 edges.
- Real operator rehearsal wrote a sealed assessment and seven-report English reviewer packet, then
  returned the expected blocked exit 4. It accepted 12/20 English cases and listed every unmet gate.

## Release-quality blockers carried forward

- Eight ordinary English subjects fail `WRITER_CLAIM_CARDINALITY`; do not lower the report minimum or
  edit the golden expected result to hide this content gap.
- Hindi and Odia doctrine/locale packs are unsupported (40 corpus cases).
- No real native-language reviews have been supplied. Agents did not invent scores or reviewers.
- Corpus-pairwise interpretation overlap and glossary adherence lack an approved measurement method
  and remain `NOT_ASSESSED` blockers. Existing similarity/script gates are not mislabeled as proxies.
- CP7 software is complete and safe to use as a release gate; the current content artifact is not
  release-eligible. Payments, worker delivery and production activation remain later checkpoints.
