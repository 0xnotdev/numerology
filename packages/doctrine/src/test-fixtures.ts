import type { DoctrineAuthoringRelease, DoctrineRule } from "./index";

export function validRule(overrides: Partial<DoctrineRule> = {}): DoctrineRule {
  return {
    actionKeys: ["reflect.pause"],
    claims: {
      en: ["This profile-specific pattern can be used as a bounded reflection prompt."],
      hi: [],
      or: [],
    },
    conditions: [{ op: "eq", path: "fact.root", value: 3 }],
    confidence: "high",
    exclusions: [],
    metricId: "life_path",
    profileId: "western_decoz_v1",
    ruleId: "western.life-path.3.v1",
    safetyTags: ["reflective", "agency"],
    sourceRefs: [
      {
        evidenceClass: "derived_product_policy",
        locator: "Document 4, root 3",
        sourceId: "SRC-TEST",
      },
    ],
    status: "active",
    themes: ["expression"],
    valence: "contextual",
    version: "1.0.0",
    ...overrides,
  };
}

export function validAuthoring(
  overrides: Partial<DoctrineAuthoringRelease> = {},
): DoctrineAuthoringRelease {
  return {
    actions: [
      {
        actionKey: "reflect.pause",
        instructions: { en: ["Pause before treating a symbolic prompt as a decision."] },
        safetyTags: ["reflective", "agency"],
        status: "active",
        version: "1.0.0",
      },
    ],
    contradictions: [],
    locales: ["en"],
    promotions: [],
    releaseId: "test-doctrine.v1",
    rules: [validRule()],
    schemaVersion: "1.0.0",
    sources: [
      {
        creator: "Numerology platform editorial policy",
        locale: "en",
        sourceId: "SRC-TEST",
        sourceType: "product_policy",
        status: "active",
        title: "Test source",
      },
    ],
    ...overrides,
  };
}
