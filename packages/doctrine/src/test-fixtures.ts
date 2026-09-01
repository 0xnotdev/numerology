import type { CanonicalDoctrineRule } from "./canonical-rule";
import { withComputedRuleContentHash } from "./content-hash";
import { parseActionId, parseRuleId, parseSourceId } from "./ids";
import type { DoctrineAuthoringRelease, DoctrineRuleBinding } from "./release-model";

export function validRule(overrides: Partial<CanonicalDoctrineRule> = {}): CanonicalDoctrineRule {
  const rule: CanonicalDoctrineRule = {
    agreement_group: "western-root-themes",
    claim_class: "C",
    confidence: "medium",
    content_hash: null,
    contradiction_ids: [],
    locale: "en",
    metric_id: "life_path",
    position_semantics: "A reflective interpretation of the calculated Life Path position.",
    prohibited_phrases: ["guaranteed outcome"],
    profile_id: "western_decoz_v1",
    review_state: "approved",
    reviewers: ["editor@example.test", "safety@example.test"],
    rule_id: parseRuleId("RULE_WESTERN_LP_3"),
    rule_type: "interpretation",
    rule_version: "1.0.0",
    safe_paraphrases: [
      "Within this profile, root 3 can be used as a bounded prompt about expression.",
    ],
    source_links: [
      {
        extraction_note: "Synthetic doctrine test locator.",
        locator: "Test source, root 3",
        source_id: parseSourceId("SRC_TEST"),
      },
    ],
    status: "active",
    themes: { constructive: ["expression"], tensions: ["scattering"] },
    trigger: { all: [{ op: "eq", path: "fact.root", value: 3 }] },
    valid_from: "2026-01-01",
    valid_to: "2026-12-31",
    ...overrides,
  };
  return withComputedRuleContentHash(rule);
}

export function bindingFor(
  ruleId = parseRuleId("RULE_WESTERN_LP_3"),
  overrides: Partial<DoctrineRuleBinding> = {},
): DoctrineRuleBinding {
  return {
    action_ids: [parseActionId("reflect.pause")],
    rule_id: ruleId,
    safety_tags: ["agency", "reflective"],
    section_key: "core.life_path",
    suppresses_rule_ids: [],
    ...overrides,
  };
}

export function validAuthoring(
  overrides: Partial<DoctrineAuthoringRelease> = {},
): DoctrineAuthoringRelease {
  const rule = validRule();
  return {
    actions: [
      {
        action_id: parseActionId("reflect.pause"),
        instructions: { en: ["Pause before treating a symbolic prompt as a decision."] },
        safety_tags: ["agency", "reflective"],
        status: "active",
        version: "1.0.0",
      },
    ],
    bindings: [bindingFor(rule.rule_id)],
    contradictions: [],
    locales: ["en"],
    release_id: "test-doctrine-2026-01",
    released_on: "2026-01-15",
    rules: [rule],
    schema_version: "1.0.0",
    sources: [
      {
        creator: "Numerology platform editorial policy",
        locale: "en",
        source_id: parseSourceId("SRC_TEST"),
        source_type: "product_policy",
        status: "active",
        title: "Synthetic test source",
      },
    ],
    ...overrides,
  };
}
