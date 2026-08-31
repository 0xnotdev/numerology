# Doctrine registry

`@numerology/doctrine` is the pure Checkpoint 3 rule-registry boundary. It validates reviewable
rule authoring, compiles immutable canonical JSON, and resolves approved evidence against a validated
`@numerology/engine` calculation bundle. It performs no I/O, database access, report planning, prompt
execution, model calls, or prose generation.

## Authoring and compilation

YAML is the editorial authoring format, but YAML parsing and file access intentionally sit outside this
package. Pass an already parsed value to `validateDoctrine` or `compileDoctrine`. The compiler applies
the exported V1 strict schemas, semantic/reference checks, canonical collection ordering, and emits:

- `release`: normalized compiled JSON data, profile/metric/root index, and `releaseHash`;
- `manifest`: release/hash/count/locale/profile metadata for reviewable release diffs;
- `canonicalJson`: byte-stable JSON suitable for a checked-in immutable release artifact.

The atomic `ruleSchemaV1` follows `technical-build-bible.md` Section 9. The repository-level release
schema adds version, locale, source, action, contradiction, and explicit promotion registries around
that atomic contract. `../data/rule.schema.json` is older domain evidence and is not the executable
schema; see the conflict decision in `progress.md`.

## Condition language

All conditions are ANDed. JavaScript, expressions, regular expressions, callbacks, prompts, and dynamic
property traversal are forbidden.

| Path | Allowed operators | Value |
|---|---|---|
| `fact.root`, `fact.compound`, `fact.master` | `eq`, `gte` | number |
| `fact.factId`, `fact.profileId`, `fact.metricId` | `eq` | string |
| `fact.displayTokens` | `contains` | string |
| `fact.occurrences.1` … `.9` | `eq`, `gte` | number |
| allowlisted planet/timing metadata paths exported by the compiler | `eq`, or `eq`/`gte` for numeric fields | typed scalar |

Rules are indexed by their declared profile/metric and an exact `fact.root` equality when present;
rules without one use the wildcard bucket. Remaining conditions run through the pure interpreter.

## Resolution safety

`createDoctrineRegistry(release).resolve(bundle, { locale })` first validates both the compiled release
and Checkpoint 2 bundle. It then excludes blocked/deprecated rules, unpromoted experimental or
low-confidence rules, blocked sources/actions, hard-block safety categories, unsafe claim atoms,
missing locale atoms, and authored exclusion targets. Matches are sorted by confidence, rule ID, then
fact ID and retain exact fact/rule/source/action provenance. Applicable contradiction records are
returned as school-boundary warnings. The complete result receives a canonical `resolutionHash`.

Run focused verification with:

```bash
pnpm --filter @numerology/doctrine typecheck
pnpm --filter @numerology/doctrine test
```
