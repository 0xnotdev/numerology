import type { ClaimClass, RuleConfidence } from "@numerology/doctrine";
import { describe, expect, it } from "vitest";
import { assertResolvedEvidenceBoundary } from "./evidence";
import { buildClaimCandidates, uniqueSourceReferences } from "./ranking";
import { buildIntegrationFixture } from "./test-support";

function rankingFixture() {
  const fixture = buildIntegrationFixture();
  const context = assertResolvedEvidenceBoundary(fixture.bundle, fixture.evidence);
  const evidence = fixture.evidence.evidence.find(
    (item) => item.ruleId === "RULE_WESTERN_LIFE_PATH",
  );
  if (evidence === undefined) {
    throw new Error("Missing ranking evidence.");
  }
  const fact = context.factsById.get(evidence.factId);
  if (fact === undefined) {
    throw new Error("Missing ranking fact.");
  }
  return { context, evidence, fact, fixture };
}

describe("claim ranking", () => {
  it("assigns exact deterministic scores, order, timing, roots, and action bonuses", () => {
    const { context, fixture } = rankingFixture();
    const candidates = buildClaimCandidates(fixture.evidence.evidence, context.factsById);

    expect(candidates.map((candidate) => candidate.ruleIds[0])).toEqual([
      "RULE_WESTERN_LIFE_PATH",
      "RULE_CHEIRO_NAME",
      "RULE_DIGIT_SUM_LIFE_PATH",
      "RULE_WESTERN_BIRTHDAY",
      "RULE_WESTERN_PERSONAL_YEAR",
      "RULE_JOHARI_PSYCHIC",
      "RULE_LOSHU_GRID",
    ]);
    expect(candidates.map((candidate) => candidate.score)).toEqual([96, 94, 90, 90, 81, 80, 70]);
    expect(candidates.map((candidate) => candidate.primaryRoot)).toEqual([3, 4, 3, 3, 3, 3, null]);
    expect(candidates.map((candidate) => candidate.timing)).toEqual([
      false,
      false,
      false,
      false,
      true,
      false,
      false,
    ]);
    expect(candidates.map((candidate) => candidate.wordBudget)).toEqual([
      80, 80, 80, 80, 70, 80, 80,
    ]);
    expect(candidates[0]).toMatchObject({
      actionIds: ["reflect.finish"],
      claimClass: "C",
      confidence: "high",
      contradictionIds: [],
      contradictionResolutions: [],
      contentHashes: [expect.stringMatching(/^sha256:/u)],
      independentProfileFamilyIds: ["modern-western"],
      profileIds: ["western_decoz_v1"],
      prohibitedPhrases: ["guaranteed outcome"],
      relationship: "unique_signal",
      reviewers: ["editor@example.test", "safety@example.test"],
      reviewState: "approved",
      ruleTypes: ["interpretation"],
      ruleVersions: ["1.0.0"],
      safetyTags: ["agency", "reflective"],
      sourceIds: ["SRC_REPORT_FIXTURE"],
      themeId: "expression",
      valence: "strength",
    });
  });

  it.each([
    ["A", 104],
    ["B", 94],
    ["C", 84],
    ["D", 74],
    ["E", 64],
    ["F", 54],
    ["G", 44],
  ] as const)("ranks claim class %s explicitly", (claimClass, score) => {
    const { evidence, fact } = rankingFixture();
    const candidate = buildClaimCandidates(
      [{ ...evidence, claimClass: claimClass satisfies ClaimClass }],
      new Map([[fact.factId, fact]]),
    )[0];
    expect(candidate?.score).toBe(score);
  });

  it.each([
    ["high", 84],
    ["medium", 74],
    ["low", 64],
    ["unresolved", -36],
  ] as const)("ranks %s confidence explicitly", (confidence, score) => {
    const { evidence, fact } = rankingFixture();
    const candidate = buildClaimCandidates(
      [{ ...evidence, confidence: confidence satisfies RuleConfidence }],
      new Map([[fact.factId, fact]]),
    )[0];
    expect(candidate?.score).toBe(score);
  });

  it.each([
    "birthday",
    "destiny_number",
    "expression",
    "life_path",
    "name_number",
    "psychic_number",
  ])("applies the core metric bonus to %s", (metricId) => {
    const { evidence, fact } = rankingFixture();
    const core = buildClaimCandidates(
      [{ ...evidence, metricId }],
      new Map([[fact.factId, { ...fact, metricId }]]),
    )[0];
    const nonCore = buildClaimCandidates(
      [{ ...evidence, metricId: "non_core" }],
      new Map([[fact.factId, { ...fact, metricId: "non_core" }]]),
    )[0];
    expect(core?.score).toBe(84);
    expect(nonCore?.score).toBe(76);
  });

  it("sorts authored claims and source locators, and drops unsupported tensions", () => {
    const { evidence, fact } = rankingFixture();
    const claims = buildClaimCandidates(
      [{ ...evidence, claims: ["Zulu.", "Alpha."] }],
      new Map([[fact.factId, fact]]),
    );
    expect(claims.map((claim) => claim.text)).toEqual(["Alpha.", "Zulu."]);

    const source = evidence.sourceReferences[0];
    if (source === undefined) {
      throw new Error("Missing ranking source.");
    }
    expect(
      uniqueSourceReferences([
        { ...source, locator: "z" },
        source,
        source,
        { ...source, locator: "a" },
      ]).map((reference) => reference.locator),
    ).toEqual(["a", source.locator, "z"]);

    expect(
      buildClaimCandidates(
        [
          {
            ...evidence,
            actionIds: [],
            actions: [],
            themes: { constructive: [], tensions: ["unsupported"] },
          },
        ],
        new Map([[fact.factId, fact]]),
      ),
    ).toEqual([]);
  });
});
