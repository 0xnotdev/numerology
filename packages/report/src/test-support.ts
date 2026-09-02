import checkpointFourRelease from "@numerology/doctrine-data/doctrine/checkpoint4-fallback.compiled.json";
import {
  compileDoctrine,
  createDoctrineRegistry,
  parseActionId,
  parseRuleId,
  parseSourceId,
  withComputedRuleContentHash,
  type CanonicalDoctrineRule,
  type DoctrineAuthoringRelease,
  type DoctrineContradiction,
  type DoctrineRuleBinding,
  type ReportSectionKey,
  type ResolvedEvidenceBundle,
  type RuleConfidence,
  type RuleType,
  type ClaimClass,
} from "@numerology/doctrine";
import {
  calculateBundle,
  type CalculatedFact,
  type CalculationBundle,
  type CalculationRequest,
  type ProfileId,
} from "@numerology/engine";
import { buildCheckpointFourReportFixture } from "./checkpoint4-fixture";

export interface RuleFixtureSpec {
  readonly actionIds?: readonly string[];
  readonly claimClass?: ClaimClass;
  readonly claims?: readonly string[];
  readonly confidence?: RuleConfidence;
  readonly constructive?: readonly string[];
  readonly metricId: string;
  readonly profileId: ProfileId;
  readonly ruleId: string;
  readonly ruleType?: RuleType;
  readonly sectionKey: ReportSectionKey;
  readonly suppressesRuleIds?: readonly string[];
  readonly tensions?: readonly string[];
  readonly triggerRoot?: number;
}

export interface IntegrationFixture {
  readonly bundle: CalculationBundle;
  readonly evidence: ResolvedEvidenceBundle;
  readonly release: ReturnType<typeof compileDoctrine>["release"];
}

export function buildCheckpointFourTestFixture() {
  return buildCheckpointFourReportFixture(checkpointFourRelease);
}

export const REPORT_FIXTURE_REQUEST = {
  asOfDate: "2026-04-15",
  civilDate: "1990-08-12",
  names: [
    { id: "birth", kind: "birth_full" as const, value: "THOMAS CRUISE MAPOTHER" },
    { id: "popular", kind: "popular" as const, value: "CHX" },
  ],
  profiles: [
    "western_decoz_v1",
    "western_digit_sum_v1",
    "cheiro_1926_v1",
    "indian_johari_1990_v1",
    "loshu_raw_dob_v1",
  ],
  schemaVersion: "1.0.0",
} as const satisfies CalculationRequest;

export const BASE_RULE_SPECS: readonly RuleFixtureSpec[] = [
  {
    actionIds: ["reflect.finish"],
    claimClass: "C",
    claims: ["Use the Life Path result as a bounded prompt about expression."],
    constructive: ["expression"],
    metricId: "life_path",
    profileId: "western_decoz_v1",
    ruleId: "RULE_WESTERN_LIFE_PATH",
    sectionKey: "life_path",
  },
  {
    claimClass: "C",
    claims: ["The birthday result offers another bounded expression prompt."],
    constructive: ["expression"],
    metricId: "birthday",
    profileId: "western_decoz_v1",
    ruleId: "RULE_WESTERN_BIRTHDAY",
    sectionKey: "birthday_psychic_comparison",
  },
  {
    claimClass: "C",
    claims: ["The alternate Western reduction keeps its own expression signal."],
    constructive: ["expression"],
    metricId: "life_path",
    profileId: "western_digit_sum_v1",
    ruleId: "RULE_DIGIT_SUM_LIFE_PATH",
    sectionKey: "life_path",
  },
  {
    actionIds: ["reflect.pause"],
    claimClass: "B",
    claims: ["Treat the Cheiro name result as a prompt for careful inquiry."],
    metricId: "name_number",
    profileId: "cheiro_1926_v1",
    ruleId: "RULE_CHEIRO_NAME",
    sectionKey: "current_name_comparison",
    tensions: ["inquiry"],
  },
  {
    claimClass: "D",
    claims: ["Keep the Johari psychic-number expression separate from Western methods."],
    constructive: ["expression"],
    metricId: "psychic_number",
    profileId: "indian_johari_1990_v1",
    ruleId: "RULE_JOHARI_PSYCHIC",
    sectionKey: "birthday_psychic_comparison",
  },
  {
    claimClass: "C",
    claims: ["Use the raw Lo Shu grid as a structural observation."],
    constructive: ["structure"],
    metricId: "grid",
    profileId: "loshu_raw_dob_v1",
    ruleId: "RULE_LOSHU_GRID",
    sectionKey: "lo_shu_raw_grid",
  },
  {
    actionIds: ["reflect.finish"],
    claimClass: "C",
    claims: ["Keep the current personal year time-bounded."],
    constructive: ["initiative"],
    metricId: "personal_year",
    profileId: "western_decoz_v1",
    ruleId: "RULE_WESTERN_PERSONAL_YEAR",
    ruleType: "timing",
    sectionKey: "personal_year",
  },
];

function requiredFact(
  bundle: CalculationBundle,
  profileId: ProfileId,
  metricId: string,
): CalculatedFact {
  const fact = bundle.facts.find(
    (candidate) => candidate.profileId === profileId && candidate.metricId === metricId,
  );
  if (fact === undefined) {
    throw new Error(`Missing report fixture fact ${profileId}.${metricId}`);
  }
  return fact;
}

function ruleFor(bundle: CalculationBundle, spec: RuleFixtureSpec): CanonicalDoctrineRule {
  const fact = requiredFact(bundle, spec.profileId, spec.metricId);
  return withComputedRuleContentHash({
    agreement_group: `report-${spec.metricId}`,
    claim_class: spec.claimClass ?? "C",
    confidence: spec.confidence ?? "high",
    content_hash: null,
    contradiction_ids: [],
    locale: "en",
    metric_id: spec.metricId,
    position_semantics: "A bounded synthetic report-planner fixture.",
    prohibited_phrases: ["guaranteed outcome"],
    profile_id: spec.profileId,
    review_state: "approved",
    reviewers: ["editor@example.test", "safety@example.test"],
    rule_id: parseRuleId(spec.ruleId),
    rule_type: spec.ruleType ?? "interpretation",
    rule_version: "1.0.0",
    safe_paraphrases: spec.claims ?? [`Bounded claim for ${spec.ruleId}.`],
    source_links: [
      {
        extraction_note: "Synthetic integration fixture.",
        locator: `fixture/${spec.ruleId}`,
        source_id: parseSourceId("SRC_REPORT_FIXTURE"),
      },
    ],
    status: "active",
    themes: {
      constructive: spec.constructive ?? [],
      tensions: spec.tensions ?? [],
    },
    trigger: {
      all: [
        {
          op: "eq",
          path: "fact.root",
          value: spec.triggerRoot ?? fact.root,
        },
      ],
    },
    valid_from: "2026-01-01",
    valid_to: "2026-12-31",
  });
}

function bindingFor(spec: RuleFixtureSpec): DoctrineRuleBinding {
  return {
    action_ids: (spec.actionIds ?? []).map(parseActionId),
    rule_id: parseRuleId(spec.ruleId),
    safety_tags: ["agency", "reflective"],
    section_key: spec.sectionKey,
    suppresses_rule_ids: (spec.suppressesRuleIds ?? []).map(parseRuleId),
  };
}

export function buildIntegrationFixture(
  specs: readonly RuleFixtureSpec[] = BASE_RULE_SPECS,
  contradictions: readonly DoctrineContradiction[] = [],
): IntegrationFixture {
  const bundle = calculateBundle(REPORT_FIXTURE_REQUEST);
  const actionIds = [...new Set(specs.flatMap((spec) => spec.actionIds ?? []))].sort();
  const authoring: DoctrineAuthoringRelease = {
    actions: actionIds.map((actionId) => ({
      action_id: parseActionId(actionId),
      instructions: { en: [`Pause and use ${actionId} only as a reversible reflection.`] },
      safety_tags: ["agency", "reflective"],
      status: "active",
      version: "1.0.0",
    })),
    bindings: specs.map(bindingFor),
    contradictions,
    locales: ["en"],
    release_id: "report-integration-2026-01",
    released_on: "2026-01-15",
    rules: specs.map((spec) => ruleFor(bundle, spec)),
    schema_version: "1.0.0",
    sources: [
      {
        creator: "Numerology report integration fixture",
        locale: "en",
        source_id: parseSourceId("SRC_REPORT_FIXTURE"),
        source_type: "product_policy",
        status: "active",
        title: "Synthetic report doctrine",
      },
    ],
  };
  const release = compileDoctrine(authoring).release;
  const evidence = createDoctrineRegistry(release).resolve(bundle, {
    asOfDate: "2026-04-15",
    locale: "en",
  });
  return { bundle, evidence, release };
}
