# Report contract, deterministic writer, and verifier

`@numerology/report` owns Checkpoint 4's framework-independent report pipeline. It accepts the real
`CalculationBundle` from `@numerology/engine` and the exact `ResolvedEvidenceBundle` from
`@numerology/doctrine`; it does not perform I/O, database access, network calls, prompting, or model
inference.

## Pipeline

1. `planReport` ranks only approved, source-linked evidence and emits a frozen, canonical-hashed
   `ReportPlan` with fact, rule, source, action, profile, contradiction, and trace provenance.
2. `writeDeterministicReport` realizes the plan with the versioned `en-IN` fallback templates. It
   performs no calculation or doctrine lookup, preserves every selected claim and trace, normalizes
   display names to NFC, and returns the strict `StructuredReport` contract.
3. `verifyStructuredReport` parses the untrusted report and runs schema, numeric, fact-linkage,
   rule/source, school-boundary, contradiction, completeness, sentence-provenance, length,
   repetition, genericity, language, safety, similarity, and PII gates. Any critical diagnostic
   makes the result invalid.
4. `projectCustomerDelivery` converts the internal report and calculation bundle into a strict,
   frozen customer DTO. It keeps readable interpretations, chart values, remedies, and useful
   methodology prose while removing internal identifiers, confidence/ranking, provenance, versions,
   hashes, and verifier records.
5. `renderCustomerDeliveryHtml` accepts only that customer projection and renders escaped semantic HTML;
   `renderStructuredReportHtml` remains an internal/reviewer renderer and never calculates or retrieves
   doctrine.

The internal report records the immutable input, engine, formula-manifest, doctrine, planner, writer,
locale, renderer, safety, verifier, and schema versions. Every visible interpretive sentence carries aligned
sentence provenance with exact fact, rule, source, claim, and template identifiers; the verifier checks
approved template text rather than trusting writer summaries or report hashes. Claim text carries exact
display-number tokens, fact IDs, rule IDs, source references, contradiction IDs, and calculation trace
IDs. The durable verification record is itself canonical-hashed.

## Canonical Checkpoint 4 fixture

The committed synthetic release and report corpus are under `data/`:

```bash
pnpm report:release:check
pnpm report:release:check --write       # rebuild only committed derived fixtures
pnpm --filter @numerology/report test
pnpm --filter @numerology/report test:coverage
```

The release gate verifies the compiled doctrine, manifest, calculation/evidence/plan/report/HTML/
verification bytes, all critical gates, and the 60-subject executable golden evaluation (20 each for
`en-IN`, `hi-IN`, and `or-IN`). The deterministic fallback is budgeted at 7,500–10,000 words with
section budgets and an eight-percent repeated-sentence ceiling. Derived fixture bytes must be regenerated
rather than edited manually.

## CLI

The reviewer planner command remains available:

```bash
pnpm report synthetic-plan --release data/doctrine/releases/starter.compiled.json \
  --fixture G-W-LP-001 --locale en --as-of 2026-08-31 \
  --policy data/report/fixtures/valid-policy.json --format json --output /tmp/plan.json
```

Checkpoint 4's local fixture commands use the frozen fallback and never accept customer data:

```bash
pnpm report generate --release data/doctrine/releases/checkpoint4-fallback.compiled.json \
  --format json --output /tmp/report.json --verification-output /tmp/verification.json
pnpm report verify --release data/doctrine/releases/checkpoint4-fallback.compiled.json \
  --report /tmp/report.json
pnpm report evaluate --release data/doctrine/releases/checkpoint4-fallback.compiled.json \
  --corpus data/report/eval-subjects.json --output /tmp/evaluation.json
```

JSON is canonical and newline-terminated; file writes use exclusive, mode-restricted temporary siblings,
fsync, symlink rejection, and atomic rename. Paired report/verification outputs stage together and roll
back on failure.
Exit codes are stable: `0` success, `1` I/O/unexpected failure, `2` usage error, and `3` invalid
input, report, or failed verification. The generate/verify fixture path is an explicitly synthetic
operator surface, not a customer API.

## Checkpoint 7 quality and release decisions

The deterministic quality workflow adds a separate release-eligibility decision. Unlike the legacy
`evaluate` command, a completed quality run exits `4` when acceptance is blocked; `0` means eligible
under the evaluated policy, not deployed or authorized for live customer traffic.

```bash
pnpm report quality --release data/doctrine/releases/checkpoint4-fallback.compiled.json \
  --corpus data/report/eval-subjects.json --locales en-IN --output reports/quality.json \
  --review-output reports/review-packet.json
pnpm report release-decision --request reports/release-request.json --output reports/decision.json
```

`--reviews <reviews.json>` supplies actual, artifact-bound native reviews. Omitting it does not
fabricate approvals: the current fallback corpus is blocked for both content coverage and missing
human review. The release-decision request replays the candidate instead of trusting a precomputed
eligibility flag. Promotion and historical rollback are local policy decisions, not cloud operations.
The optional review packet contains only ordinary verified synthetic reports, bound to the same
artifact as the assessment. Paired output files use the existing atomic paired-write behavior.
See [the operator quality guide](../../docs/report-quality.md) for the rubric and release constraints.

## Planner policy and gates

Every policy property is optional and defaults to `DEFAULT_PLANNER_POLICY`: non-negative action/theme
limits, root/timing word-share limits in `(0, 1]`, and a minimum independent-profile-family count.
Root and timing limits converge together because both use the same total-word denominator.

Useful package gates:

```bash
pnpm --filter @numerology/report typecheck
pnpm --filter @numerology/report test
pnpm --filter @numerology/report test:fixtures
pnpm --filter @numerology/report test:e2e
pnpm --filter @numerology/report test:coverage
pnpm --filter @numerology/report pack --dry-run
```

Mutation testing is a manual offline audit (`pnpm audit:mutation:offline`), outside agent development
and checkpoint verification. The legacy `report:mutation:deep` command remains a manual report-only alias.
