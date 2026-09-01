import { deepFreeze } from "@numerology/shared";
import { parseTrigger } from "./conditions";
import { compareText } from "./diagnostics";
import type { RuleId } from "./ids";
import { sortedUnique } from "./normalization";
import type { CanonicalDoctrineRule } from "./canonical-rule";
import type { DoctrineIndex } from "./release-model";

export function buildDoctrineIndex(rules: readonly CanonicalDoctrineRule[]): DoctrineIndex {
  const mutable: Record<string, Record<string, Record<string, RuleId[]>>> = {};
  for (const rule of [...rules].sort((left, right) => compareText(left.rule_id, right.rule_id))) {
    if (rule.metric_id === null) {
      continue;
    }
    const parsed = parseTrigger(rule.trigger);
    const rootCondition = parsed.conditions?.find(
      (condition) => condition.op === "eq" && condition.path === "fact.root",
    );
    const root =
      rootCondition?.op === "eq" && typeof rootCondition.value === "number"
        ? String(rootCondition.value)
        : "*";
    let profile = mutable[rule.profile_id];
    if (profile === undefined) {
      profile = {};
      mutable[rule.profile_id] = profile;
    }
    let metric = profile[rule.metric_id];
    if (metric === undefined) {
      metric = {};
      profile[rule.metric_id] = metric;
    }
    let ruleIds = metric[root];
    if (ruleIds === undefined) {
      ruleIds = [];
      metric[root] = ruleIds;
    }
    ruleIds.push(rule.rule_id);
  }
  for (const profile of Object.values(mutable)) {
    for (const metric of Object.values(profile)) {
      for (const [root, ruleIds] of Object.entries(metric)) {
        metric[root] = sortedUnique(ruleIds);
      }
    }
  }
  return deepFreeze({ byProfileMetricRoot: mutable });
}

export function indexRuleIds(
  index: DoctrineIndex,
  profileId: string,
  metricId: string,
  root: number,
): readonly RuleId[] {
  const roots = index.byProfileMetricRoot[profileId]?.[metricId];
  return roots === undefined
    ? Object.freeze([])
    : Object.freeze(sortedUnique([...(roots[String(root)] ?? []), ...(roots["*"] ?? [])]));
}
