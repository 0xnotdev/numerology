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
   rule/source, school-boundary, contradiction, completeness, genericity, language, safety,
   similarity, and PII gates. Any critical diagnostic makes the result invalid.
4. `renderStructuredReportHtml` consumes only a parsed report and renders escaped semantic HTML with
   headings, keyboard-visible links, responsive cards, an accessible Lo Shu table, and a methodology
   appendix. It never calculates or retrieves doctrine.

The report records the immutable input, engine, formula-manifest, doctrine, planner, writer, locale,
renderer, safety, verifier, and schema versions. Claim text carries exact display-number tokens,
fact IDs, rule IDs, source references, contradiction IDs, and calculation trace IDs. The durable
verification record is itself canonical-hashed.

## Canonical Checkpoint 4 fixture

The committed synthetic release and report corpus are under `data/`:

```bash
pnpm report:release:check
pnpm report:release:check --write       # rebuild only committed derived fixtures
pnpm --filter @numerology/report test
pnpm --filter @numerology/report test:coverage
pnpm --filter @numerology/report mutation
```

The release gate verifies the compiled doctrine, manifest, calculation/evidence/plan/report/HTML/
verification bytes, all critical gates, and the 60-subject evaluation corpus (20 each for `en-IN`,
`hi-IN`, and `or-IN`). Derived fixture bytes must be regenerated rather than edited manually.

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
```

JSON is canonical and newline-terminated; file writes use a temporary sibling followed by rename.
Exit codes are stable: `0` success, `1` I/O/unexpected failure, `2` usage error, and `3` invalid
input, report, or failed verification. The generate/verify fixture path is an explicitly synthetic
operator surface, not a customer API.

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
pnpm --filter @numerology/report mutation
pnpm --filter @numerology/report pack --dry-run
```
