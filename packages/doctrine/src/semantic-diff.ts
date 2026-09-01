import { stableStringify } from "@numerology/engine";
import { deepFreeze } from "@numerology/shared";
import { CANONICAL_RULE_RUNTIME_FIELDS } from "./canonical-rule";
import { parseCompiledDoctrine } from "./compiler";
import { compareText } from "./diagnostics";
import type { ActionId, RuleId, SourceId } from "./ids";

export interface ChangedRule {
  readonly changedFields: readonly string[];
  readonly ruleId: RuleId;
}

export interface DoctrineSemanticDiff {
  readonly actions: {
    readonly added: readonly ActionId[];
    readonly changed: readonly ActionId[];
    readonly removed: readonly ActionId[];
  };
  readonly afterHash: string;
  readonly beforeHash: string;
  readonly bindingsChanged: readonly RuleId[];
  readonly rules: {
    readonly added: readonly RuleId[];
    readonly changed: readonly ChangedRule[];
    readonly removed: readonly RuleId[];
  };
  readonly sources: {
    readonly added: readonly SourceId[];
    readonly changed: readonly SourceId[];
    readonly removed: readonly SourceId[];
  };
}

function mapDiff<T extends string, V>(
  before: ReadonlyMap<T, V>,
  after: ReadonlyMap<T, V>,
): { readonly added: T[]; readonly changed: T[]; readonly removed: T[] } {
  const added = [...after.keys()].filter((id) => !before.has(id)).sort(compareText);
  const removed = [...before.keys()].filter((id) => !after.has(id)).sort(compareText);
  const changed = [...before.keys()]
    .filter(
      (id) => after.has(id) && stableStringify(before.get(id)) !== stableStringify(after.get(id)),
    )
    .sort(compareText);
  return { added, changed, removed };
}

export function diffCompiledDoctrine(
  beforeInput: unknown,
  afterInput: unknown,
): DoctrineSemanticDiff {
  const before = parseCompiledDoctrine(beforeInput);
  const after = parseCompiledDoctrine(afterInput);
  const beforeRules = new Map(before.rules.map((rule) => [rule.rule_id, rule]));
  const afterRules = new Map(after.rules.map((rule) => [rule.rule_id, rule]));
  const ruleSet = mapDiff(beforeRules, afterRules);
  const changedRules = ruleSet.changed.map((ruleId) => {
    const beforeRule = beforeRules.get(ruleId);
    const afterRule = afterRules.get(ruleId);
    const changedFields = Object.keys(CANONICAL_RULE_RUNTIME_FIELDS)
      .filter(
        (field) =>
          stableStringify(beforeRule?.[field as keyof typeof beforeRule]) !==
          stableStringify(afterRule?.[field as keyof typeof afterRule]),
      )
      .sort(compareText);
    return { changedFields, ruleId };
  });

  const bindings = mapDiff(
    new Map(before.bindings.map((binding) => [binding.rule_id, binding])),
    new Map(after.bindings.map((binding) => [binding.rule_id, binding])),
  );
  return deepFreeze({
    actions: mapDiff(
      new Map(before.actions.map((action) => [action.action_id, action])),
      new Map(after.actions.map((action) => [action.action_id, action])),
    ),
    afterHash: after.release_hash,
    beforeHash: before.release_hash,
    bindingsChanged: [...bindings.added, ...bindings.changed, ...bindings.removed].sort(
      compareText,
    ),
    rules: { added: ruleSet.added, changed: changedRules, removed: ruleSet.removed },
    sources: mapDiff(
      new Map(before.sources.map((source) => [source.source_id, source])),
      new Map(after.sources.map((source) => [source.source_id, source])),
    ),
  });
}
