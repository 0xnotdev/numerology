import {
  PROFILE_IDS,
  PROFILE_MANIFESTS,
  stableStringify,
  type ProfileId,
} from "@numerology/engine";
import type { CanonicalDoctrineRule } from "./canonical-rule";
import { parseTrigger } from "./conditions";
import { calculateRuleContentHash, isCanonicalHash } from "./content-hash";
import type { DoctrineDiagnostic } from "./diagnostics";
import { compareText, freezeDiagnostics } from "./diagnostics";
import type { RuleId } from "./ids";
import type { DoctrineAuthoringRelease } from "./release-model";

const PROFILE_ID_SET = new Set<string>(PROFILE_IDS);

function isProfileId(value: string): value is ProfileId {
  return PROFILE_ID_SET.has(value);
}

function metricExists(profileId: ProfileId, metricId: string): boolean {
  const metrics = PROFILE_MANIFESTS[profileId].metrics;
  if (Object.hasOwn(metrics, metricId)) {
    return true;
  }
  return (
    profileId === "western_decoz_v1" &&
    Object.hasOwn(metrics, "personal_month") &&
    /^personal_month\.(?:0[1-9]|1[0-2])$/u.test(metricId)
  );
}

function addDuplicateDiagnostics<T extends string>(
  diagnostics: DoctrineDiagnostic[],
  values: readonly T[],
  code: string,
  path: string,
): void {
  const seen = new Set<T>();
  for (const value of values) {
    if (seen.has(value)) {
      diagnostics.push({ code, message: `Duplicate identifier: ${value}.`, path });
    }
    seen.add(value);
  }
}

function addEmptyStrings(
  diagnostics: DoctrineDiagnostic[],
  values: readonly string[],
  code: string,
  path: string,
): void {
  if (values.some((value) => value.trim().length === 0)) {
    diagnostics.push({ code, message: "Empty strings are not allowed.", path });
  }
}

function suppressionCycles(input: DoctrineAuthoringRelease): readonly string[] {
  const graph = new Map(
    input.bindings.map((binding) => [binding.rule_id, binding.suppresses_rule_ids]),
  );
  const visiting = new Set<RuleId>();
  const visited = new Set<RuleId>();
  const cycles = new Set<string>();

  function visit(ruleId: RuleId, trail: readonly RuleId[]): void {
    if (visiting.has(ruleId)) {
      const start = trail.indexOf(ruleId);
      cycles.add([...trail.slice(start), ruleId].join(" -> "));
      return;
    }
    if (visited.has(ruleId)) {
      return;
    }
    visiting.add(ruleId);
    for (const target of graph.get(ruleId) ?? []) {
      if (graph.has(target)) {
        visit(target, [...trail, ruleId]);
      }
    }
    visiting.delete(ruleId);
    visited.add(ruleId);
  }

  for (const ruleId of [...graph.keys()].sort(compareText)) {
    visit(ruleId, []);
  }
  return [...cycles].sort(compareText);
}

function validateTrigger(rule: CanonicalDoctrineRule, diagnostics: DoctrineDiagnostic[]): void {
  const basePath = `rules.${rule.rule_id}.trigger`;
  const parsed = parseTrigger(rule.trigger, basePath);
  if (parsed.conditions === undefined) {
    diagnostics.push(...parsed.diagnostics);
    return;
  }
  addDuplicateDiagnostics(
    diagnostics,
    parsed.conditions.map(stableStringify),
    "DUPLICATE_CONDITION",
    basePath,
  );

  const equality = new Map<string, string>();
  parsed.conditions.forEach((condition, index) => {
    if (condition.op !== "eq") {
      return;
    }
    const value = stableStringify(condition.value);
    const prior = equality.get(condition.path);
    if (prior !== undefined && prior !== value) {
      diagnostics.push({
        code: "UNSATISFIABLE_CONDITIONS",
        message: `Conflicting equality conditions for ${condition.path}.`,
        path: `${basePath}.all.${index}`,
      });
    }
    equality.set(condition.path, value);
    if (condition.path === "fact.profileId" && condition.value !== rule.profile_id) {
      diagnostics.push({
        code: "CONDITION_IDENTITY_CONFLICT",
        message: "Profile condition crosses the rule profile boundary.",
        path: `${basePath}.all.${index}`,
      });
    }
    if (
      condition.path === "fact.metricId" &&
      rule.metric_id !== null &&
      condition.value !== rule.metric_id
    ) {
      diagnostics.push({
        code: "CONDITION_IDENTITY_CONFLICT",
        message: "Metric condition crosses the rule metric boundary.",
        path: `${basePath}.all.${index}`,
      });
    }
  });
}

function validateRule(
  rule: CanonicalDoctrineRule,
  input: DoctrineAuthoringRelease,
  diagnostics: DoctrineDiagnostic[],
  sourceIds: ReadonlySet<string>,
  contradictionIds: ReadonlySet<string>,
): void {
  const path = `rules.${rule.rule_id}`;
  if (!isProfileId(rule.profile_id)) {
    diagnostics.push({
      code: "UNKNOWN_PROFILE",
      message: `Unknown profile ${rule.profile_id}.`,
      path: `${path}.profile_id`,
    });
  } else if (rule.metric_id !== null && !metricExists(rule.profile_id, rule.metric_id)) {
    diagnostics.push({
      code: "UNKNOWN_METRIC",
      message: `Metric ${rule.metric_id} is not in profile ${rule.profile_id}.`,
      path: `${path}.metric_id`,
    });
  }
  if (rule.status === "active" && rule.metric_id === null) {
    diagnostics.push({
      code: "ACTIVE_RULE_REQUIRES_METRIC",
      message: "An active runtime rule must declare metric_id.",
      path: `${path}.metric_id`,
    });
  }
  if (!input.locales.includes(rule.locale)) {
    diagnostics.push({
      code: "UNKNOWN_RULE_LOCALE",
      message: `Rule locale ${rule.locale} is not released.`,
      path: `${path}.locale`,
    });
  }
  addDuplicateDiagnostics(diagnostics, rule.reviewers, "DUPLICATE_REVIEWER", `${path}.reviewers`);
  addDuplicateDiagnostics(
    diagnostics,
    rule.source_links.map((link) => `${link.source_id}\u0000${link.locator}`),
    "DUPLICATE_SOURCE_LINK",
    `${path}.source_links`,
  );
  addDuplicateDiagnostics(
    diagnostics,
    rule.contradiction_ids,
    "DUPLICATE_CONTRADICTION_REFERENCE",
    `${path}.contradiction_ids`,
  );
  addEmptyStrings(diagnostics, rule.reviewers, "INVALID_REVIEWER", `${path}.reviewers`);
  addEmptyStrings(
    diagnostics,
    rule.safe_paraphrases,
    "INVALID_SAFE_PARAPHRASE",
    `${path}.safe_paraphrases`,
  );
  addEmptyStrings(
    diagnostics,
    rule.prohibited_phrases,
    "INVALID_PROHIBITED_PHRASE",
    `${path}.prohibited_phrases`,
  );
  if (rule.source_links.some((link) => link.locator.trim().length === 0)) {
    diagnostics.push({
      code: "INVALID_SOURCE_LOCATOR",
      message: "Source locators cannot be empty.",
      path: `${path}.source_links`,
    });
  }
  for (const link of rule.source_links) {
    if (!sourceIds.has(link.source_id)) {
      diagnostics.push({
        code: "UNKNOWN_SOURCE",
        message: `Unknown source ${link.source_id}.`,
        path: `${path}.source_links`,
      });
    }
  }
  for (const contradictionId of rule.contradiction_ids) {
    if (!contradictionIds.has(contradictionId)) {
      diagnostics.push({
        code: "UNKNOWN_CONTRADICTION",
        message: `Unknown contradiction ${contradictionId}.`,
        path: `${path}.contradiction_ids`,
      });
    }
  }
  if (rule.valid_from !== null && rule.valid_to !== null && rule.valid_from > rule.valid_to) {
    diagnostics.push({
      code: "INVALID_VALIDITY_RANGE",
      message: "valid_from cannot be after valid_to.",
      path: `${path}.valid_to`,
    });
  }

  const normalizedProhibited = rule.prohibited_phrases.map((phrase) =>
    phrase.normalize("NFC").toLocaleLowerCase("en-US"),
  );
  if (
    rule.safe_paraphrases.some((claim) => {
      const normalized = claim.normalize("NFC").toLocaleLowerCase("en-US");
      return normalizedProhibited.some((phrase) => normalized.includes(phrase));
    })
  ) {
    diagnostics.push({
      code: "PROHIBITED_PHRASE_IN_CLAIM",
      message: "A safe paraphrase contains a prohibited phrase.",
      path: `${path}.safe_paraphrases`,
    });
  }

  if (rule.content_hash !== null) {
    if (!isCanonicalHash(rule.content_hash)) {
      diagnostics.push({
        code: "INVALID_CONTENT_HASH",
        message: "content_hash must be a canonical sha256 hash.",
        path: `${path}.content_hash`,
      });
    } else if (rule.content_hash !== calculateRuleContentHash(rule)) {
      diagnostics.push({
        code: "CONTENT_HASH_MISMATCH",
        message: "content_hash does not match normalized rule content.",
        path: `${path}.content_hash`,
      });
    }
  }
  if (rule.status === "active") {
    if (rule.review_state !== "approved") {
      diagnostics.push({
        code: "ACTIVE_RULE_NOT_APPROVED",
        message: "Active rules must be approved.",
        path: `${path}.review_state`,
      });
    }
    if (new Set(rule.reviewers).size < 2) {
      diagnostics.push({
        code: "INSUFFICIENT_REVIEWERS",
        message: "Active rules require two distinct reviewers.",
        path: `${path}.reviewers`,
      });
    }
    if (rule.safe_paraphrases.length === 0) {
      diagnostics.push({
        code: "MISSING_SAFE_PARAPHRASE",
        message: "Active rules require at least one safe paraphrase.",
        path: `${path}.safe_paraphrases`,
      });
    }
    if (rule.source_links.length === 0) {
      diagnostics.push({
        code: "MISSING_SOURCE_LINK",
        message: "Active rules require at least one source link.",
        path: `${path}.source_links`,
      });
    }
    if (rule.content_hash === null) {
      diagnostics.push({
        code: "MISSING_CONTENT_HASH",
        message: "Active rules require a reviewed content_hash.",
        path: `${path}.content_hash`,
      });
    }
  }
  validateTrigger(rule, diagnostics);
}

export function semanticDiagnostics(
  input: DoctrineAuthoringRelease,
): readonly DoctrineDiagnostic[] {
  const diagnostics: DoctrineDiagnostic[] = [];
  addDuplicateDiagnostics(
    diagnostics,
    input.rules.map((rule) => rule.rule_id),
    "DUPLICATE_RULE_ID",
    "rules",
  );
  addDuplicateDiagnostics(
    diagnostics,
    input.sources.map((source) => source.source_id),
    "DUPLICATE_SOURCE_ID",
    "sources",
  );
  addDuplicateDiagnostics(
    diagnostics,
    input.actions.map((action) => action.action_id),
    "DUPLICATE_ACTION_ID",
    "actions",
  );
  addDuplicateDiagnostics(
    diagnostics,
    input.bindings.map((binding) => binding.rule_id),
    "DUPLICATE_BINDING",
    "bindings",
  );
  addDuplicateDiagnostics(
    diagnostics,
    input.contradictions.map((item) => item.contradiction_id),
    "DUPLICATE_CONTRADICTION_ID",
    "contradictions",
  );
  addDuplicateDiagnostics(diagnostics, input.locales, "DUPLICATE_LOCALE", "locales");

  const ruleIds = new Set(input.rules.map((rule) => rule.rule_id));
  const sourceIds = new Set(input.sources.map((source) => source.source_id));
  const actionIds = new Set(input.actions.map((action) => action.action_id));
  const contradictionIds = new Set(input.contradictions.map((item) => item.contradiction_id));
  const boundRuleIds = new Set(input.bindings.map((binding) => binding.rule_id));

  for (const rule of input.rules) {
    if (!boundRuleIds.has(rule.rule_id)) {
      diagnostics.push({
        code: "MISSING_RULE_BINDING",
        message: `Rule ${rule.rule_id} has no operational binding.`,
        path: "bindings",
      });
    }
    validateRule(rule, input, diagnostics, sourceIds, contradictionIds);
  }

  for (const binding of input.bindings) {
    if (!ruleIds.has(binding.rule_id)) {
      diagnostics.push({
        code: "UNKNOWN_BOUND_RULE",
        message: `Binding references unknown rule ${binding.rule_id}.`,
        path: `bindings.${binding.rule_id}.rule_id`,
      });
    }
    addDuplicateDiagnostics(
      diagnostics,
      binding.action_ids,
      "DUPLICATE_ACTION_REFERENCE",
      `bindings.${binding.rule_id}.action_ids`,
    );
    addDuplicateDiagnostics(
      diagnostics,
      binding.suppresses_rule_ids,
      "DUPLICATE_SUPPRESSION",
      `bindings.${binding.rule_id}.suppresses_rule_ids`,
    );
    for (const actionId of binding.action_ids) {
      if (!actionIds.has(actionId)) {
        diagnostics.push({
          code: "UNKNOWN_ACTION",
          message: `Binding references unknown action ${actionId}.`,
          path: `bindings.${binding.rule_id}.action_ids`,
        });
      }
    }
    for (const target of binding.suppresses_rule_ids) {
      if (!ruleIds.has(target)) {
        diagnostics.push({
          code: "UNKNOWN_SUPPRESSION_TARGET",
          message: `Binding suppresses unknown rule ${target}.`,
          path: `bindings.${binding.rule_id}.suppresses_rule_ids`,
        });
      }
      if (target === binding.rule_id) {
        diagnostics.push({
          code: "SELF_SUPPRESSION",
          message: "A matching rule cannot suppress itself.",
          path: `bindings.${binding.rule_id}.suppresses_rule_ids`,
        });
      }
    }
  }

  for (const action of input.actions) {
    for (const locale of input.locales) {
      if ((action.instructions[locale] ?? []).length === 0) {
        diagnostics.push({
          code: "MISSING_ACTION_LOCALE",
          message: `Action ${action.action_id} has no ${locale} instruction.`,
          path: `actions.${action.action_id}.instructions.${locale}`,
        });
      }
    }
  }
  for (const cycle of suppressionCycles(input)) {
    diagnostics.push({
      code: "SUPPRESSION_CYCLE",
      message: `Rule suppression cycle: ${cycle}.`,
      path: "bindings.suppresses_rule_ids",
    });
  }
  return freezeDiagnostics(diagnostics);
}
