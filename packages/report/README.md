# Deterministic report planner

`@numerology/report` is Checkpoint 3's framework-independent planning and reviewer surface. Its public
`planReport(bundle, evidence, policy?)` API accepts the real `CalculationBundle` export from
`@numerology/engine` and the exact `ResolvedEvidenceBundle` export from `@numerology/doctrine`. There is
no report-side evidence bundle, parsing adapter, database, network, framework, prompt, or model.

The planner validates calculation/evidence identity and reproducibility hashes, ranks independently
attributable authored claims, applies per-theme repetition and editorial limits, retains mandatory
contradiction warnings, allocates doctrine-resolved actions and all 18 canonical doctrine sections,
and emits a recursively frozen, canonical-hashed `ReportPlan`. Branded fact, rule, source, and action
IDs remain branded throughout its public API and trace output.

## Reviewer CLI

Run from the repository root:

```bash
# Canonical machine-readable JSON (the default).
pnpm report synthetic-plan \
  --release data/doctrine/releases/starter.compiled.json \
  --fixture G-W-LP-001 --locale en --as-of 2026-08-31 \
  --policy data/report/fixtures/valid-policy.json \
  --format json --output /tmp/report-plan.json

# Deterministic human-readable reviewer view.
pnpm report synthetic-plan \
  --release data/doctrine/releases/starter.compiled.json \
  --fixture G-W-LP-001 --locale en --as-of 2026-08-31 \
  --policy data/report/fixtures/valid-policy.json \
  --format markdown --output /tmp/report-plan.md

pnpm report --help
```

Required arguments are `--release`, `--fixture`, `--locale`, and `--as-of`. Optional arguments are
`--policy`, `--format json|markdown`, and `--output`. JSON is canonical and newline-terminated; writes
are atomic. Markdown includes reproducibility identity, suppressions, section reservations, fact/rule/
source provenance, and resolved actions.

Exit codes are stable: `0` success, `1` I/O or unexpected failure, `2` command/argument usage error,
and `3` invalid JSON, fixture, policy, doctrine release, evidence, or plan. Committed valid/invalid
policies and byte-stable JSON/Markdown outputs live in `data/report/fixtures`.

## Policy

Every property is optional; defaults are exported as `DEFAULT_PLANNER_POLICY`.

- `maxActions`: non-negative integer.
- `maxClaimsPerTheme`: non-negative integer. `0` removes optional theme claims but mandatory doctrine
  contradiction warnings remain.
- `maxRootWordShare`, `maxTimingWordShare`: numbers greater than `0` and at most `1`.
- `minimumIndependentProfileFamilies`: non-negative integer.

Ranking is total and deterministic: score descending, mandatory status, theme ID, branded rule IDs,
branded fact IDs, claim text, then claim ID. The theme cap is applied after ranking and independently
per theme. Safety/editorial invariants are applied after the cap and can only remove optional claims;
they never remove mandatory contradiction warnings.

## Responsibility map

- `evidence.ts`: package-boundary identity and resolution audit validation.
- `ranking.ts`: candidate construction, scoring, total ranking, theme cap, and valence runs.
- `selection.ts`: section, action, timing, and root constraints.
- `contradictions.ts`: mandatory doctrine contradiction claims.
- `actions.ts` / `sections.ts`: resolved action and canonical section allocation.
- `trace.ts`: lossless registry audit propagation.
- `serialization.ts` / `validation.ts`: durable plan conversion, statistics, stable bytes, and validation.
- `cli.ts` / `viewer.ts`: production CLI and reviewer Markdown.

## Gates

```bash
pnpm --filter @numerology/report typecheck
pnpm --filter @numerology/report test
pnpm --filter @numerology/report test:fixtures
pnpm --filter @numerology/report test:e2e
pnpm --filter @numerology/report test:coverage  # >=95% branches
pnpm --filter @numerology/report mutation       # >=90% score
pnpm --filter @numerology/report pack --dry-run
```
