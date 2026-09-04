# Doctrine compiler and resolved-evidence boundary

`@numerology/doctrine` owns the Checkpoint 3 editorial compiler, immutable rule registry, and the only
contract reporting should consume: `ResolvedEvidenceBundle`. It performs no database, network, prompt,
model, prose-generation, or report-planning work.

## Canonical schema

`data/rule.schema.json` is the canonical atomic rule schema. `canonical-rule.ts` loads that JSON through
the `@numerology/doctrine-data` workspace package and compiles it with JSON Schema draft 2020-12 AJV.
It does **not** maintain an independently invented Zod rule schema. `CANONICAL_RULE_RUNTIME_FIELDS` and
schema-parity tests make property/enum drift fail both at compile time and in tests.

The release envelope adds sources, actions, operational bindings, contradictions, locales, and release
metadata. It does not redefine an atomic rule. Each canonical property survives compilation, including
`rule_type`, `claim_class`, constructive/tension themes, safe/prohibited phrases, source links,
validity dates, review state/reviewers, and content hash. Optional schema properties normalize to
explicit nulls, empty collections, or the schema's `en` locale default.

Active rules must have an allowlisted metric/trigger, approved review state, two distinct reviewers, a
safe paraphrase, source evidence, and a matching SHA-256 content hash. Compilation recomputes the hash
after deterministic normalization. Draft/deprecated/retracted rules can remain in editorial releases,
but resolution emits evidence only for active, approved, in-date rules.

## Editorial CLI

Run commands from the repository root. Inputs are UTF-8 JSON. Machine outputs use canonical,
lexicographically ordered JSON; reviewer markdown is deterministic. Usage errors exit 2, invalid
releases exit 3, and I/O/unexpected failures exit 1.

```bash
# Validate canonical schema, review, references, content hashes, and trigger semantics.
pnpm doctrine validate --input data/doctrine/fixtures/valid-release.json

# Compile an immutable release and deterministic manifest. Writes are atomic.
pnpm doctrine compile \
  --input data/doctrine/releases/starter.authoring.json \
  --output /tmp/starter.compiled.json \
  --manifest /tmp/starter.manifest.json

# Diff compiled releases by rule fields plus source/action/binding IDs.
pnpm doctrine diff \
  --before data/doctrine/releases/starter.compiled.json \
  --after /tmp/starter.compiled.json \
  --output /tmp/doctrine.diff.json

# Resolve a real engine fixture through doctrine. Despite the historical command name, this emits
# only ResolvedEvidenceBundle and deliberately does not add a report planner.
pnpm doctrine synthetic-plan \
  --release data/doctrine/releases/starter.compiled.json \
  --fixture G-W-LP-001 --locale en --as-of 2026-08-31 \
  --output /tmp/evidence.json

# Practical reviewer queue; --state is optional, --format is markdown (default) or json.
pnpm doctrine review \
  --input data/doctrine/releases/starter.authoring.json \
  --state approved --format markdown --output /tmp/review.md
```

`data/doctrine/fixtures/invalid-release.json` is intentionally invalid. The committed release and
manifest are checked byte-for-byte by `pnpm doctrine:release:check`; the command also performs a
synthetic resolution smoke test.

## Trigger language

A trigger is `{ "all": [...] }`; every condition must pass. Expressions, callbacks, regular
expressions, arbitrary traversal, prompts, and executable code are rejected.

| Path | Operators | Value |
|---|---|---|
| `fact.root`, `fact.compound`, `fact.master` | `eq`, `gte` | finite number |
| `fact.factId`, `fact.profileId`, `fact.metricId` | `eq` | string |
| `fact.displayTokens` | `contains` | string |
| `fact.occurrences.1` … `.9` | `eq`, `gte` | finite number |
| allowlisted planet/timing metadata paths in `conditions.ts` | `eq`, or `eq`/`gte` | typed scalar |

## Reporting boundary

Reporting must import `ResolvedEvidenceBundle` directly from `@numerology/doctrine`; it must not invent
an adapter or a parallel evidence shape. Every selected evidence record contains:

- branded fact/rule/source/action IDs, exact source locators, and calculation trace IDs;
- claims, constructive/tension themes, claim class, rule type, confidence, review state/reviewers;
- section key, safety tags, prohibited phrases, resolved actions, validity, rule version/content hash;
- `suppressesRuleIds`, whose invariant is explicit: these are **target rule IDs suppressed by this
  matching rule**. The field never means the matching rule discards itself;
- release/schema/engine/formula/input/calculation hashes, locale and dates for reproduction.

`omissions`, `suppressions`, and `traces` explain every matched candidate's outcome. Suppression records
carry both suppressing and suppressed rule/fact IDs. All returned graphs are recursively frozen by the
single shared `@numerology/shared` implementation.

## Gates

```bash
pnpm --filter @numerology/doctrine test:fixtures
pnpm --filter @numerology/doctrine test:coverage  # >=95% branches
pnpm --filter @numerology/doctrine typecheck
pnpm doctrine:release:check
```

Mutation testing is available only as a manual offline audit through `pnpm audit:mutation:offline`.
It is outside the agent development and checkpoint verification loop.
