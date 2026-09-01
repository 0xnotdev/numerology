import { stableStringify } from "@numerology/engine";
import type { CanonicalDoctrineRule } from "./canonical-rule";
import { parseTrigger } from "./conditions";
import { compareText } from "./diagnostics";
import type { DoctrineAuthoringRelease } from "./release-model";

export function sortedUnique<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort(compareText);
}

export function normalizeRule(rule: CanonicalDoctrineRule): CanonicalDoctrineRule {
  const trigger = parseTrigger(rule.trigger);
  const normalizedTrigger =
    trigger.conditions === undefined
      ? structuredClone(rule.trigger)
      : {
          all: [...trigger.conditions].sort((left, right) =>
            compareText(stableStringify(left), stableStringify(right)),
          ),
        };
  return {
    ...rule,
    contradiction_ids: sortedUnique(rule.contradiction_ids),
    prohibited_phrases: sortedUnique(rule.prohibited_phrases),
    reviewers: sortedUnique(rule.reviewers),
    safe_paraphrases: sortedUnique(rule.safe_paraphrases),
    source_links: [...rule.source_links].sort((left, right) =>
      compareText(stableStringify(left), stableStringify(right)),
    ),
    themes: {
      constructive: sortedUnique(rule.themes.constructive),
      tensions: sortedUnique(rule.themes.tensions),
    },
    trigger: normalizedTrigger,
  };
}

export function normalizeAuthoringRelease(
  input: DoctrineAuthoringRelease,
): DoctrineAuthoringRelease {
  return {
    actions: [...input.actions]
      .map((action) => ({
        ...action,
        instructions: Object.fromEntries(
          Object.entries(action.instructions)
            .sort(([left], [right]) => compareText(left, right))
            .map(([locale, instructions]) => [locale, sortedUnique(instructions)]),
        ),
        safety_tags: sortedUnique(action.safety_tags),
      }))
      .sort((left, right) => compareText(left.action_id, right.action_id)),
    bindings: [...input.bindings]
      .map((binding) => ({
        ...binding,
        action_ids: sortedUnique(binding.action_ids),
        safety_tags: sortedUnique(binding.safety_tags),
        suppresses_rule_ids: sortedUnique(binding.suppresses_rule_ids),
      }))
      .sort((left, right) => compareText(left.rule_id, right.rule_id)),
    contradictions: [...input.contradictions].sort((left, right) =>
      compareText(left.contradiction_id, right.contradiction_id),
    ),
    locales: sortedUnique(input.locales),
    release_id: input.release_id,
    released_on: input.released_on,
    rules: [...input.rules]
      .map(normalizeRule)
      .sort((left, right) => compareText(left.rule_id, right.rule_id)),
    schema_version: input.schema_version,
    sources: [...input.sources].sort((left, right) => compareText(left.source_id, right.source_id)),
  };
}
