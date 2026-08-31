import { calculateBundle } from "@numerology/engine";
import { describe, expect, it } from "vitest";
import {
  ReportPlanningError,
  planReport,
  type PlannerPolicy,
  type ReportPlanningInput,
  validateReportPlan,
} from "./index";

const DOCTRINE_HASH = `sha256:${"a".repeat(64)}`;

const LOW_THRESHOLD_POLICY: PlannerPolicy = {
  maxRootWordShare: 1,
  maxTimingWordShare: 1,
  minimumIndependentProfileFamilies: 1,
};

function requiredAt<T>(values: readonly T[], index: number, label: string): T {
  const value = values[index];
  if (value === undefined) {
    throw new Error(`Missing ${label} at index ${index}`);
  }
  return value;
}

function syntheticInput(): ReportPlanningInput {
  const bundle = calculateBundle({
    asOfDate: "2026-04-15",
    civilDate: "1990-08-12",
    names: [
      { id: "birth", kind: "birth_full", value: "THOMAS CRUISE MAPOTHER" },
      { id: "popular", kind: "popular", value: "CHX" },
    ],
    profiles: [
      "western_decoz_v1",
      "western_digit_sum_v1",
      "cheiro_1926_v1",
      "indian_johari_1990_v1",
      "loshu_raw_dob_v1",
    ],
    schemaVersion: "1.0.0",
  });

  const fact = (profileId: string, metricId: string): string => {
    const result = bundle.facts.find(
      (candidate) => candidate.profileId === profileId && candidate.metricId === metricId,
    );
    if (result === undefined) {
      throw new Error(`Missing fixture fact ${profileId}.${metricId}`);
    }
    return result.factId;
  };

  const westernLifePath = fact("western_decoz_v1", "life_path");
  const westernBirthday = fact("western_decoz_v1", "birthday");
  const digitSumLifePath = fact("western_digit_sum_v1", "life_path");
  const westernPersonalYear = fact("western_decoz_v1", "personal_year");
  const cheiroName = fact("cheiro_1926_v1", "name_number");
  const johariPsychic = fact("indian_johari_1990_v1", "psychic_number");
  const johariName = fact("indian_johari_1990_v1", "name_number");
  const loShuGrid = fact("loshu_raw_dob_v1", "grid");

  return {
    bundle,
    evidence: {
      actions: [
        {
          actionKey: "action.finish-one-idea",
          cost: "free",
          reversibility: "reversible",
          safety: "low_risk",
        },
        {
          actionKey: "action.weekly-check-in",
          cost: "free",
          reversibility: "reversible",
          safety: "low_risk",
        },
      ],
      contradictions: [
        {
          contradictionId: "CONTRA-MAP-001",
          factIds: [cheiroName, johariName],
          profileIds: ["cheiro_1926_v1", "indian_johari_1990_v1"],
          resolution: "immutable_table_id",
          sourceRefIds: ["SRC-CONTRADICTION-MATRIX"],
        },
      ],
      doctrineManifestHash: DOCTRINE_HASH,
      doctrineVersion: "doctrine-test-1.0.0",
      profileCatalog: [
        {
          familyId: "modern-western",
          methodLabel: "Modern Western",
          profileId: "western_decoz_v1",
        },
        {
          familyId: "modern-western",
          methodLabel: "Modern Western alternate reduction",
          profileId: "western_digit_sum_v1",
        },
        { familyId: "cheiro", methodLabel: "Cheiro", profileId: "cheiro_1926_v1" },
        { familyId: "johari", methodLabel: "Johari", profileId: "indian_johari_1990_v1" },
        { familyId: "lo-shu", methodLabel: "Lo Shu", profileId: "loshu_raw_dob_v1" },
      ],
      resolvedRules: [
        {
          actionKeys: ["action.finish-one-idea"],
          claimClass: "C",
          confidence: "high",
          exclusions: [],
          factId: westernLifePath,
          profileId: "western_decoz_v1",
          reviewState: "approved",
          ruleId: "RULE-WESTERN-LIFE-PATH-EXPRESSION",
          ruleVersion: "1.0.0",
          safetyTags: [],
          sectionKey: "life_path",
          sourceRefIds: ["SRC-WESTERN"],
          status: "active",
          themeIds: ["expression"],
          valence: "strength",
        },
        {
          actionKeys: [],
          claimClass: "C",
          confidence: "high",
          exclusions: [],
          factId: westernBirthday,
          profileId: "western_decoz_v1",
          reviewState: "approved",
          ruleId: "RULE-WESTERN-BIRTHDAY-EXPRESSION",
          ruleVersion: "1.0.0",
          safetyTags: [],
          sectionKey: "birthday_psychic_comparison",
          sourceRefIds: ["SRC-WESTERN"],
          status: "active",
          themeIds: ["expression"],
          valence: "strength",
        },
        {
          actionKeys: [],
          claimClass: "C",
          confidence: "high",
          exclusions: [],
          factId: digitSumLifePath,
          profileId: "western_digit_sum_v1",
          reviewState: "approved",
          ruleId: "RULE-WESTERN-DIGIT-SUM-EXPRESSION",
          ruleVersion: "1.0.0",
          safetyTags: [],
          sectionKey: "life_path",
          sourceRefIds: ["SRC-WESTERN"],
          status: "active",
          themeIds: ["expression"],
          valence: "strength",
        },
        {
          actionKeys: ["action.weekly-check-in"],
          claimClass: "B",
          confidence: "high",
          exclusions: [],
          factId: cheiroName,
          profileId: "cheiro_1926_v1",
          reviewState: "approved",
          ruleId: "RULE-CHEIRO-NAME-INQUIRY",
          ruleVersion: "1.0.0",
          safetyTags: [],
          sectionKey: "current_name_comparison",
          sourceRefIds: ["SRC-CHEIRO"],
          status: "active",
          themeIds: ["inquiry"],
          valence: "tension",
        },
        {
          actionKeys: [],
          claimClass: "D",
          confidence: "high",
          exclusions: [],
          factId: johariPsychic,
          profileId: "indian_johari_1990_v1",
          reviewState: "approved",
          ruleId: "RULE-JOHARI-PSYCHIC-EXPRESSION",
          ruleVersion: "1.0.0",
          safetyTags: [],
          sectionKey: "birthday_psychic_comparison",
          sourceRefIds: ["SRC-JOHARI"],
          status: "active",
          themeIds: ["expression"],
          valence: "strength",
        },
        {
          actionKeys: [],
          claimClass: "D",
          confidence: "high",
          exclusions: [],
          factId: johariName,
          profileId: "indian_johari_1990_v1",
          reviewState: "approved",
          ruleId: "RULE-JOHARI-NAME-INITIATIVE",
          ruleVersion: "1.0.0",
          safetyTags: [],
          sectionKey: "current_name_comparison",
          sourceRefIds: ["SRC-JOHARI"],
          status: "active",
          themeIds: ["initiative"],
          valence: "strength",
        },
        {
          actionKeys: [],
          claimClass: "C",
          confidence: "medium",
          exclusions: [],
          factId: loShuGrid,
          profileId: "loshu_raw_dob_v1",
          reviewState: "approved",
          ruleId: "RULE-LOSHU-GRID-STRUCTURE",
          ruleVersion: "1.0.0",
          safetyTags: [],
          sectionKey: "lo_shu_raw_grid",
          sourceRefIds: ["SRC-LOSHU"],
          status: "active",
          themeIds: ["structure"],
          valence: "strength",
        },
        {
          actionKeys: ["action.finish-one-idea"],
          claimClass: "C",
          confidence: "high",
          exclusions: [],
          factId: westernPersonalYear,
          profileId: "western_decoz_v1",
          reviewState: "approved",
          ruleId: "RULE-WESTERN-PERSONAL-YEAR-INITIATIVE",
          ruleVersion: "1.0.0",
          safetyTags: [],
          sectionKey: "personal_year",
          sourceRefIds: ["SRC-WESTERN"],
          status: "active",
          themeIds: ["initiative"],
          timeRelevance: "current",
          valence: "contextual",
        },
      ],
      schemaVersion: "1.0.0",
      sources: [
        {
          evidenceClass: "authoritative_practitioner",
          locator: "pp. 1-2",
          sourceId: "SRC-WESTERN",
        },
        {
          evidenceClass: "primary",
          locator: "p. 70",
          sourceId: "SRC-CHEIRO",
        },
        {
          evidenceClass: "authoritative_practitioner",
          locator: "p. 10",
          sourceId: "SRC-JOHARI",
        },
        {
          evidenceClass: "authoritative_practitioner",
          locator: "grid rule 1",
          sourceId: "SRC-LOSHU",
        },
        {
          evidenceClass: "derived_product_policy",
          locator: "CONTRA-MAP-001",
          sourceId: "SRC-CONTRADICTION-MATRIX",
        },
      ],
      themeOntology: [
        {
          complementThemeIds: ["structure"],
          origin: "authored",
          themeId: "expression",
          tensionThemeIds: [],
        },
        {
          complementThemeIds: [],
          origin: "authored",
          themeId: "inquiry",
          tensionThemeIds: [],
        },
        {
          complementThemeIds: [],
          origin: "authored",
          themeId: "initiative",
          tensionThemeIds: [],
        },
        {
          complementThemeIds: ["expression"],
          origin: "authored",
          themeId: "structure",
          tensionThemeIds: [],
        },
      ],
    },
    schemaVersion: "1.0.0",
  };
}

function reorderedInput(): ReportPlanningInput {
  const input = syntheticInput();
  return {
    ...input,
    bundle: { ...input.bundle, facts: [...input.bundle.facts].reverse() },
    evidence: {
      ...input.evidence,
      actions: [...input.evidence.actions].reverse(),
      profileCatalog: [...input.evidence.profileCatalog].reverse(),
      resolvedRules: [...input.evidence.resolvedRules].reverse(),
      sources: [...input.evidence.sources].reverse(),
      themeOntology: [...input.evidence.themeOntology].reverse(),
    },
  };
}

describe("deterministic report planner", () => {
  it("produces a golden synthetic plan with stable scores, order, word budgets, and hash", () => {
    const plan = planReport(syntheticInput());

    expect(plan.planHash).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(plan.claims.map((claim) => claim.claimId)).toEqual([
      "claim.theme.initiative",
      "claim.theme.expression",
      "claim.theme.inquiry",
      "claim.theme.structure",
      "claim.complement.expression.structure",
      "claim.contradiction.CONTRA-MAP-001",
    ]);
    expect(plan.claims.map((claim) => claim.score)).toEqual([70, 54, 50, 25, 0, 0]);
    expect(plan.claims.map((claim) => claim.wordBudget)).toEqual([100, 100, 80, 80, 80, 100]);
    expect(plan.sections.map((section) => section.order)).toEqual(
      Array.from({ length: 18 }, (_, index) => index + 1),
    );
    expect(plan.statistics).toMatchObject({
      independentProfileFamilyCount: 4,
      timingWordBudget: 100,
      totalInterpretiveWordBudget: 540,
    });
  });

  it("is byte-stable under input collection ordering changes", () => {
    const first = planReport(syntheticInput());
    const second = planReport(reorderedInput());

    expect(second).toEqual(first);
    expect(second.planHash).toBe(first.planHash);
  });

  it("distinguishes independent convergence, unique signals, complements, and explicit conflicts", () => {
    const plan = planReport(syntheticInput());
    const expression = plan.claims.find((claim) => claim.themeId === "expression");
    const inquiry = plan.claims.find((claim) => claim.themeId === "inquiry");
    const complement = plan.claims.find((claim) => claim.relationship === "complement");
    const conflict = plan.claims.find((claim) => claim.relationship === "contradiction");

    expect(expression).toMatchObject({
      independentProfileFamilyIds: ["johari", "modern-western"],
      relationship: "convergence",
    });
    expect(inquiry).toMatchObject({ relationship: "unique_signal" });
    expect(complement).toMatchObject({
      claimClass: "G",
      origin: "derived",
      relationship: "complement",
    });
    expect(conflict).toMatchObject({
      contradictionIds: ["CONTRA-MAP-001"],
      contradictionResolutions: ["immutable_table_id"],
      relationship: "contradiction",
    });
    expect(conflict?.factLinks.map((link) => link.profileId)).toEqual([
      "cheiro_1926_v1",
      "indian_johari_1990_v1",
    ]);
  });

  it("does not count two profiles in one family as independent convergence or average their roots", () => {
    const input = syntheticInput();
    const plan = planReport(
      {
        ...input,
        bundle: {
          ...input.bundle,
          facts: input.bundle.facts.filter((fact) =>
            ["western_decoz_v1", "western_digit_sum_v1"].includes(fact.profileId),
          ),
        },
        evidence: {
          ...input.evidence,
          contradictions: [],
          profileCatalog: input.evidence.profileCatalog.filter((profile) =>
            ["western_decoz_v1", "western_digit_sum_v1"].includes(profile.profileId),
          ),
          resolvedRules: input.evidence.resolvedRules.filter((rule) =>
            ["western_decoz_v1", "western_digit_sum_v1"].includes(rule.profileId),
          ),
        },
      },
      LOW_THRESHOLD_POLICY,
    );
    const expression = plan.claims.find((claim) => claim.themeId === "expression");

    expect(expression).toMatchObject({
      independentProfileFamilyIds: ["modern-western"],
      relationship: "unique_signal",
    });
    expect(expression?.allowedDisplayNumbers).toEqual(["12", "3", "30"]);
    expect("averagedRoot" in (expression ?? {})).toBe(false);
  });

  it("reserves every fixed mandatory section and enforces balance, timing, and action limits", () => {
    const input = syntheticInput();
    const extraFactIds = [
      "western_decoz_v1.attitude",
      "western_decoz_v1.expression",
      "western_decoz_v1.bridge_soul_personality",
      "western_decoz_v1.personal_month.03",
      "western_decoz_v1.maturity",
      "western_decoz_v1.soul_urge",
    ];
    const actionRules = Array.from({ length: 6 }, (_, index) => ({
      actionKeys: [`action.extra-${index + 1}`],
      claimClass: "C" as const,
      confidence: "high" as const,
      exclusions: [],
      factId: extraFactIds[index] ?? "missing",
      profileId: "western_decoz_v1",
      reviewState: "approved" as const,
      ruleId: `RULE-EXTRA-ACTION-${index + 1}`,
      ruleVersion: "1.0.0",
      safetyTags: [],
      sectionKey: "growth_edges" as const,
      sourceRefIds: ["SRC-WESTERN"],
      status: "active" as const,
      themeIds: [`action-theme-${index + 1}`],
      valence: "strength" as const,
    }));
    const plan = planReport({
      ...input,
      evidence: {
        ...input.evidence,
        actions: [
          ...input.evidence.actions,
          ...Array.from({ length: 6 }, (_, index) => ({
            actionKey: `action.extra-${index + 1}`,
            cost: "free" as const,
            reversibility: "reversible" as const,
            safety: "low_risk" as const,
          })),
        ],
        resolvedRules: [...input.evidence.resolvedRules, ...actionRules],
        themeOntology: [
          ...input.evidence.themeOntology,
          ...Array.from({ length: 6 }, (_, index) => ({
            complementThemeIds: [],
            origin: "authored" as const,
            themeId: `action-theme-${index + 1}`,
            tensionThemeIds: [],
          })),
        ],
      },
    });

    expect(plan.sections.every((section) => section.reserved)).toBe(true);
    expect(
      plan.sections.find((section) => section.key === "core_overview")?.reservedFactIds,
    ).toEqual(expect.arrayContaining(["western_decoz_v1.life_path"]));
    expect(plan.profileMethods.map((profile) => profile.profileId)).toEqual(
      expect.arrayContaining(["western_decoz_v1", "cheiro_1926_v1", "indian_johari_1990_v1"]),
    );
    expect(plan.reservations).toEqual(
      expect.arrayContaining(["core_overview", "school_disagreement", "actions", "safety_note"]),
    );
    expect(plan.actions).toHaveLength(5);
    expect(plan.actions.every((action) => action.cost === "free")).toBe(true);
    expect(plan.actions.every((action) => action.reversibility === "reversible")).toBe(true);
    expect(
      plan.statistics.timingWordBudget / plan.statistics.totalInterpretiveWordBudget,
    ).toBeLessThanOrEqual(0.2);
    expect(Math.max(...Object.values(plan.statistics.rootWordBudgets))).toBeLessThanOrEqual(
      plan.statistics.totalInterpretiveWordBudget * 0.25,
    );
    expect(validateReportPlan(plan)).toEqual({ diagnostics: [], valid: true });
  });

  it("does not stack more than two tension claims without a strength counterbalance", () => {
    const input = syntheticInput();
    const baseRule = requiredAt(input.evidence.resolvedRules, 0, "base rule");
    const plan = planReport(
      {
        ...input,
        evidence: {
          ...input.evidence,
          resolvedRules: [
            ...input.evidence.resolvedRules,
            ...["tension-a", "tension-b", "tension-c"].map((themeId) => ({
              ...baseRule,
              ruleId: `RULE-${themeId.toUpperCase()}`,
              sectionKey: "growth_edges" as const,
              themeIds: [themeId],
              valence: "tension" as const,
            })),
          ],
          themeOntology: [
            ...input.evidence.themeOntology,
            ...["tension-a", "tension-b", "tension-c"].map((themeId) => ({
              complementThemeIds: [],
              origin: "authored" as const,
              themeId,
              tensionThemeIds: [],
            })),
          ],
        },
      },
      { maxRootWordShare: 1 },
    );

    expect(plan.claims.filter((claim) => claim.valence === "tension")).toHaveLength(2);
    expect(plan.claims.some((claim) => claim.valence === "strength")).toBe(true);
  });

  it("fails closed on insufficient independent families and malformed evidence links", () => {
    const input = syntheticInput();
    const sameFamily = {
      ...input,
      evidence: {
        ...input.evidence,
        profileCatalog: input.evidence.profileCatalog.map((profile) => ({
          ...profile,
          familyId: "one-family",
        })),
      },
    };
    const malformed = {
      ...input,
      evidence: {
        ...input.evidence,
        resolvedRules: [
          ...input.evidence.resolvedRules,
          {
            ...requiredAt(input.evidence.resolvedRules, 0, "base rule"),
            factId: "missing.fact",
            ruleId: "RULE-MISSING",
          },
        ],
      },
    };
    const profileMismatch = {
      ...input,
      evidence: {
        ...input.evidence,
        resolvedRules: [
          ...input.evidence.resolvedRules,
          {
            ...requiredAt(input.evidence.resolvedRules, 0, "base rule"),
            profileId: "cheiro_1926_v1",
            ruleId: "RULE-PROFILE-MISMATCH",
          },
        ],
      },
    };

    expect(() => planReport(sameFamily)).toThrow(
      new ReportPlanningError("INSUFFICIENT_INDEPENDENT_PROFILE_FAMILIES"),
    );
    expect(() => planReport(malformed)).toThrow(new ReportPlanningError("EVIDENCE_FACT_UNKNOWN"));
    expect(() => planReport(profileMismatch)).toThrow(
      new ReportPlanningError("EVIDENCE_PROFILE_FACT_MISMATCH"),
    );
  });

  it("keeps fact, trace, rule, source, and action provenance on every selected claim", () => {
    const plan = planReport(syntheticInput());

    for (const claim of plan.claims) {
      expect(claim.factIds.length).toBeGreaterThan(0);
      expect(claim.ruleIds.length).toBeGreaterThan(0);
      expect(claim.sourceLinks.length).toBeGreaterThan(0);
      expect(claim.factLinks.every((link) => link.traceIds.length > 0)).toBe(true);
    }
    for (const action of plan.actions) {
      expect(action.ruleIds.length).toBeGreaterThan(0);
      expect(action.sourceLinks.length).toBeGreaterThan(0);
    }
  });

  it("abstains from generated Johari 9x9 readings while retaining an authored sourced signal", () => {
    const input = syntheticInput();
    const psychic = input.bundle.facts.find(
      (fact) => fact.factId === "indian_johari_1990_v1.psychic_number",
    );
    const destiny = input.bundle.facts.find(
      (fact) => fact.factId === "indian_johari_1990_v1.destiny_number",
    );
    if (psychic === undefined || destiny === undefined) {
      throw new Error("Johari test facts must exist");
    }
    const plan = planReport(
      {
        ...input,
        evidence: {
          ...input.evidence,
          resolvedRules: [
            ...input.evidence.resolvedRules,
            {
              ...requiredAt(input.evidence.resolvedRules, 4, "Johari base rule"),
              factId: psychic.factId,
              ruleId: "RULE-JOHARI-PAIR-PSYCHIC",
              themeIds: ["johari-pair"],
            },
            {
              ...requiredAt(input.evidence.resolvedRules, 4, "Johari base rule"),
              factId: destiny.factId,
              ruleId: "RULE-JOHARI-PAIR-DESTINY",
              themeIds: ["johari-pair"],
            },
          ],
          themeOntology: [
            ...input.evidence.themeOntology,
            {
              complementThemeIds: ["structure"],
              origin: "authored" as const,
              themeId: "johari-pair",
              tensionThemeIds: [],
            },
          ],
        },
      },
      { maxRootWordShare: 1 },
    );

    expect(plan.claims.map((claim) => claim.claimId)).toContain("claim.theme.johari-pair");
    expect(plan.claims.map((claim) => claim.claimId)).not.toContain(
      "claim.complement.johari-pair.structure",
    );
  });

  it("filters low-confidence, V1-excluded, unsafe, and high-stakes action candidates", () => {
    const input = syntheticInput();
    const unsafeFact = requiredAt(input.bundle.facts, 0, "unsafe fixture fact");
    const plan = planReport({
      ...input,
      evidence: {
        ...input.evidence,
        actions: [
          ...input.evidence.actions,
          {
            actionKey: "action.buy-remedy",
            cost: "paid",
            reversibility: "irreversible",
            safety: "high_risk",
          },
        ],
        resolvedRules: [
          ...input.evidence.resolvedRules,
          {
            ...requiredAt(input.evidence.resolvedRules, 0, "base rule"),
            confidence: "low",
            ruleId: "RULE-LOW-CONFIDENCE",
            themeIds: ["low-confidence"],
          },
          {
            ...requiredAt(input.evidence.resolvedRules, 0, "base rule"),
            exclusions: ["v1"],
            ruleId: "RULE-V1-EXCLUDED",
            themeIds: ["v1-excluded"],
          },
          {
            ...requiredAt(input.evidence.resolvedRules, 0, "base rule"),
            actionKeys: ["action.buy-remedy"],
            factId: unsafeFact.factId,
            ruleId: "RULE-HIGH-STAKES",
            safetyTags: ["health"],
            themeIds: ["unsafe-health"],
          },
        ],
        themeOntology: [
          ...input.evidence.themeOntology,
          ...["low-confidence", "v1-excluded", "unsafe-health"].map((themeId) => ({
            complementThemeIds: [],
            origin: "authored" as const,
            themeId,
            tensionThemeIds: [],
          })),
        ],
      },
    });

    expect(plan.claims.map((claim) => claim.ruleIds)).not.toContainEqual(["RULE-LOW-CONFIDENCE"]);
    expect(plan.claims.map((claim) => claim.ruleIds)).not.toContainEqual(["RULE-V1-EXCLUDED"]);
    expect(plan.claims.map((claim) => claim.ruleIds)).not.toContainEqual(["RULE-HIGH-STAKES"]);
    expect(plan.actions.map((action) => action.actionKey)).not.toContain("action.buy-remedy");
  });

  it("fails plan validation when section order or canonical hash is tampered with", () => {
    const plan = planReport(syntheticInput());
    const tampered = {
      ...plan,
      planHash: `sha256:${"0".repeat(64)}`,
      sections: [...plan.sections].reverse(),
    };

    expect(validateReportPlan(tampered)).toMatchObject({ valid: false });
    expect(validateReportPlan(tampered).diagnostics).toEqual(
      expect.arrayContaining(["PLAN_HASH_MISMATCH", "PLAN_SECTION_ORDER"]),
    );
  });
});
