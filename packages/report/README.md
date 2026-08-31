# Deterministic report planner

Checkpoint 3's framework-independent planner turns a validated Checkpoint 2 `CalculationBundle` and
an explicit `ResolvedEvidenceBundle` into a frozen, canonical-hashed `ReportPlan`.

`ResolvedEvidenceBundle` is the integration seam for the later doctrine worker's
`DoctrineRegistry.resolve` output. This package does not load YAML/CSV, compile doctrine, calculate
numbers, access a database, call Next.js, or call a model.

```powershell
pnpm --filter @numerology/report test
pnpm --filter @numerology/report typecheck
```

The planner only accepts active, approved, sourced, non-low-confidence doctrine matches. It keeps
profile-family convergence separate from same-family repetition, reserves all 18 report sections,
retains fact/trace/rule/source/action provenance, records explicit contradiction-matrix conflicts,
and permits only free/low-cost reversible low-risk actions. It rejects unsafe or V1-excluded matches
and does not derive a Johari-only 9x9 pair reading from the unresolved matrix.
