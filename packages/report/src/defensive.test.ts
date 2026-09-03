import { parseActionId, parseRuleId, type ResolvedEvidenceBundle } from "@numerology/doctrine";
import { canonicalHash, parseFactId } from "@numerology/engine";
import { describe, expect, it } from "vitest";
import { buildPlannedActions } from "./actions";
import { candidateRank } from "./candidate";
import { buildContradictionCandidates } from "./contradictions";
import { assertResolvedEvidenceBoundary } from "./evidence";
import { parseReportClaimId } from "./ids";
import { planReport } from "./planner";
import { buildClaimCandidates } from "./ranking";
import { selectClaims } from "./selection";
import { BASE_RULE_SPECS, buildIntegrationFixture } from "./test-support";
import { validateReportPlan } from "./validation";
import { renderReportPlan } from "./viewer";

function rehash(
  evidence: Omit<ResolvedEvidenceBundle, "resolutionHash"> & { readonly resolutionHash: string },
): ResolvedEvidenceBundle {
  const { resolutionHash: _resolutionHash, ...content } = evidence;
  return { ...content, resolutionHash: canonicalHash(content) };
}

function fixtureCandidates() {
  const fixture = buildIntegrationFixture();
  const context = assertResolvedEvidenceBoundary(fixture.bundle, fixture.evidence);
  return {
    candidates: buildClaimCandidates(fixture.evidence.evidence, context.factsById),
    context,
    fixture,
  };
}

describe("planner defensive invariants", () => {
  it("rejects malformed calculation and evidence schema objects before planning", () => {
    const { bundle, evidence } = buildIntegrationFixture();
    expect(() => Reflect.apply(assertResolvedEvidenceBoundary, undefined, [{}, evidence])).toThrow(
      "CALCULATION_BUNDLE_INVALID",
    );
    expect(() =>
      Reflect.apply(assertResolvedEvidenceBoundary, undefined, [
        bundle,
        { ...evidence, schemaVersion: "0" },
      ]),
    ).toThrow("EVIDENCE_SCHEMA_INVALID");
  });

  it("rejects changed evidence hashes and reproducibility metadata", () => {
    const { bundle, evidence } = buildIntegrationFixture();
    expect(() =>
      assertResolvedEvidenceBoundary(bundle, {
        ...evidence,
        resolutionHash: `sha256:${"0".repeat(64)}`,
      }),
    ).toThrow("EVIDENCE_RESOLUTION_HASH_MISMATCH");
    const drifted = rehash({
      ...evidence,
      reproducibility: { ...evidence.reproducibility, engineVersion: "changed" },
    });
    expect(() => assertResolvedEvidenceBoundary(bundle, drifted)).toThrow(
      "EVIDENCE_REPRODUCIBILITY_MISMATCH",
    );
  });

  it("rejects unknown, duplicate, or internally inconsistent evidence identities", () => {
    const { bundle, evidence } = buildIntegrationFixture();
    const first = evidence.evidence[0];
    if (first === undefined) {
      throw new Error("Missing defensive evidence.");
    }
    const firstTrace = evidence.traces[0];
    if (firstTrace === undefined) {
      throw new Error("Missing defensive trace.");
    }
    const unknownFact = rehash({
      ...evidence,
      evidence: [{ ...first, factId: parseFactId("missing.fact") }],
      traces: [{ ...firstTrace, factId: parseFactId("missing.fact") }],
    });
    expect(() => assertResolvedEvidenceBoundary(bundle, unknownFact)).toThrow(
      "EVIDENCE_FACT_UNKNOWN",
    );

    const duplicate = rehash({ ...evidence, evidence: [first, first] });
    expect(() => assertResolvedEvidenceBoundary(bundle, duplicate)).toThrow(
      "EVIDENCE_IDENTITY_DUPLICATE",
    );

    const invalidIdentity = rehash({
      ...evidence,
      evidence: [{ ...first, claims: [] }],
    });
    expect(() => assertResolvedEvidenceBoundary(bundle, invalidIdentity)).toThrow(
      "EVIDENCE_IDENTITY_INVALID",
    );
  });

  it("rejects trace, source/action, selection, and suppression drift", () => {
    const fixture = buildIntegrationFixture();
    const first = fixture.evidence.evidence[0];
    if (first === undefined) {
      throw new Error("Missing defensive evidence.");
    }
    const traceMismatch = rehash({
      ...fixture.evidence,
      evidence: [{ ...first, calculationTraceIds: ["missing-trace"] }],
    });
    expect(() => assertResolvedEvidenceBoundary(fixture.bundle, traceMismatch)).toThrow(
      "EVIDENCE_TRACE_MISMATCH",
    );

    const sourceMismatch = rehash({
      ...fixture.evidence,
      evidence: [{ ...first, sourceIds: [] }],
    });
    expect(() => assertResolvedEvidenceBoundary(fixture.bundle, sourceMismatch)).toThrow(
      "EVIDENCE_REFERENCE_MISMATCH",
    );

    const traceSelectionMismatch = rehash({ ...fixture.evidence, traces: [] });
    expect(() => assertResolvedEvidenceBoundary(fixture.bundle, traceSelectionMismatch)).toThrow(
      "EVIDENCE_SELECTION_TRACE_MISMATCH",
    );

    const suppressionBase = BASE_RULE_SPECS[0];
    if (suppressionBase === undefined) {
      throw new Error("Missing suppression base.");
    }
    const suppressingFixture = buildIntegrationFixture([
      { ...suppressionBase, ruleId: "RULE_PRIMARY", suppressesRuleIds: ["RULE_TARGET"] },
      { ...suppressionBase, ruleId: "RULE_TARGET" },
    ]);
    const suppression = suppressingFixture.evidence.suppressions[0];
    if (suppression === undefined) {
      throw new Error("Missing suppression fixture.");
    }
    const suppressionMismatch = rehash({
      ...suppressingFixture.evidence,
      suppressions: [{ ...suppression, suppressingFactId: parseFactId("missing.fact") }],
    });
    expect(() =>
      assertResolvedEvidenceBoundary(suppressingFixture.bundle, suppressionMismatch),
    ).toThrow("EVIDENCE_SUPPRESSION_INVALID");
  });

  it("exercises total candidate ranking tie-breaks and missing fact/action failures", () => {
    const { candidates, context } = fixtureCandidates();
    const first = candidates[0];
    if (first === undefined) {
      throw new Error("Missing candidate.");
    }
    expect(candidateRank(first, first)).toBe(0);
    expect(candidateRank({ ...first, mandatory: true }, first)).toBeLessThan(0);
    expect(candidateRank({ ...first, score: first.score + 1 }, first)).toBeLessThan(0);
    expect(candidateRank({ ...first, themeId: "aaa" }, first)).toBeLessThan(0);
    expect(candidateRank({ ...first, ruleIds: [parseRuleId("AAA")] }, first)).toBeLessThan(0);
    expect(candidateRank({ ...first, factIds: [parseFactId("aaa.fact")] }, first)).toBeLessThan(0);
    expect(candidateRank({ ...first, text: "" }, first)).toBeLessThan(0);
    expect(() => buildClaimCandidates(first.evidence, new Map())).toThrow("EVIDENCE_FACT_UNKNOWN");
    expect(() =>
      buildPlannedActions([{ ...first, actionIds: [parseActionId("missing.action")] }], 1),
    ).toThrow("PLAN_ACTION_REFERENCE_MISSING");
    expect(context.factsById.size).toBeGreaterThan(0);
  });

  it("handles unsupported contradictions and section/root overflow without instability", () => {
    const { candidates, context, fixture } = fixtureCandidates();
    const unsupported = buildContradictionCandidates(
      [
        {
          contradiction_id: "UNSUPPORTED",
          dimension: "x",
          position_a: "a",
          position_b: "b",
          profile_a: "western_balliett_1908_v1",
          profile_b: "loshu_indian_augmented_v1",
          resolution: "show",
        },
      ],
      fixture.evidence.evidence,
      context.factsById,
    );
    expect(unsupported).toEqual([]);

    const first = candidates[0];
    if (first === undefined) {
      throw new Error("Missing overflow candidate.");
    }
    const repeated = Array.from({ length: 8 }, (_, index) => ({
      ...first,
      claimId: parseReportClaimId(`claim.overflow-${index}`),
      ruleIds: [parseRuleId(`RULE_OVERFLOW_${index}`)],
      score: 100 - index,
      sectionKey: "growth_edges" as const,
      themeId: `theme-${index}`,
    })).filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== undefined);
    const selected = selectClaims(repeated, [], {
      maxActions: 5,
      maxClaimsPerTheme: 1,
      maxRootWordShare: 0.5,
      maxTimingWordShare: 1,
      minimumIndependentProfileFamilies: 0,
    });
    expect(selected.length).toBeLessThan(repeated.length);
    expect(selected.reduce((sum, claim) => sum + claim.wordBudget, 0)).toBeLessThanOrEqual(480);

    const mandatoryTiming = { ...first, mandatory: true, timing: true };
    expect(
      selectClaims([], [mandatoryTiming], {
        maxActions: 0,
        maxClaimsPerTheme: 0,
        maxRootWordShare: 1,
        maxTimingWordShare: 0.5,
        minimumIndependentProfileFamilies: 0,
      }),
    ).toEqual([mandatoryTiming]);
    const mandatoryRoot = { ...first, mandatory: true, timing: false };
    expect(
      selectClaims([], [mandatoryRoot], {
        maxActions: 0,
        maxClaimsPerTheme: 0,
        maxRootWordShare: 0.5,
        maxTimingWordShare: 1,
        minimumIndependentProfileFamilies: 0,
      }),
    ).toEqual([mandatoryRoot]);
  });

  it("renders suppression and empty-action reviewer states", () => {
    const primary = BASE_RULE_SPECS[0];
    if (primary === undefined) {
      throw new Error("Missing viewer fixture.");
    }
    const fixture = buildIntegrationFixture([
      { ...primary, actionIds: [], ruleId: "RULE_PRIMARY", suppressesRuleIds: ["RULE_TARGET"] },
      { ...primary, actionIds: [], ruleId: "RULE_TARGET" },
    ]);
    const plan = planReport(fixture.bundle, fixture.evidence, {
      maxActions: 0,
      maxClaimsPerTheme: 0,
      maxRootWordShare: 1,
      maxTimingWordShare: 1,
      minimumIndependentProfileFamilies: 0,
    });
    const markdown = renderReportPlan(plan);
    expect(markdown).toContain("## Suppressions");
    expect(markdown).toContain("_No action selected._");
  });

  it("collects independent durable-plan validation failures", () => {
    const fixture = buildIntegrationFixture();
    const plan = planReport(fixture.bundle, fixture.evidence, {
      maxRootWordShare: 1,
      maxTimingWordShare: 1,
      minimumIndependentProfileFamilies: 0,
    });
    const baseClaim = plan.claims[0];
    if (baseClaim === undefined) {
      throw new Error("Missing validation claim.");
    }
    const cases: readonly [unknown, string][] = [
      [null, "PLAN_OBJECT_REQUIRED"],
      [{ ...plan, schemaVersion: "0" }, "PLAN_SCHEMA_VERSION"],
      [{ ...plan, plannerVersion: "old" }, "PLAN_PLANNER_VERSION"],
      [{ ...plan, claims: undefined }, "PLAN_CLAIMS_REQUIRED"],
      [{ ...plan, claims: [null] }, "PLAN_CLAIM_INVALID"],
      [{ ...plan, claims: [baseClaim, baseClaim] }, "PLAN_CLAIM_PROVENANCE"],
      [
        {
          ...plan,
          claims: [{ ...baseClaim, themeId: 1 }],
        },
        "PLAN_CLAIM_INVALID",
      ],
      [
        {
          ...plan,
          claims: [
            { ...baseClaim, claimId: "t1", valence: "tension" },
            { ...baseClaim, claimId: "t2", valence: "tension" },
            { ...baseClaim, claimId: "t3", valence: "tension" },
          ],
        },
        "PLAN_NEGATIVE_BALANCE",
      ],
      [{ ...plan, sections: [] }, "PLAN_SECTION_CARDINALITY"],
      [{ ...plan, sections: [null, ...plan.sections.slice(1)] }, "PLAN_SECTION_ORDER"],
      [
        {
          ...plan,
          sections: plan.sections.map((section) => ({ ...section, claimIds: [] })),
        },
        "PLAN_SECTION_CLAIM_LINK",
      ],
      [
        {
          ...plan,
          claims: [{ ...baseClaim, wordBudget: 10_000 }],
        },
        "PLAN_SECTION_WORD_BUDGET",
      ],
      [{ ...plan, actions: Array.from({ length: 6 }, () => plan.actions[0]) }, "PLAN_ACTION_LIMIT"],
      [{ ...plan, actions: [null] }, "PLAN_ACTION_INVALID"],
      [
        { ...plan, actions: [], claims: [{ ...baseClaim, valence: "tension" }] },
        "PLAN_TENSION_WITHOUT_ACTION",
      ],
      [{ ...plan, statistics: null }, "PLAN_STATISTICS_INVALID"],
      [
        {
          ...plan,
          statistics: {
            ...plan.statistics,
            rootWordBudgets: { 1: 100 },
            timingWordBudget: 100,
            totalInterpretiveWordBudget: 100,
          },
        },
        "PLAN_BALANCE_LIMIT",
      ],
      [{ ...plan, reservations: [] }, "PLAN_MANDATORY_RESERVATION"],
      [{ ...plan, profileMethods: [] }, "PLAN_DOCTRINE_IDENTITY"],
      [{ ...plan, planHash: "bad" }, "PLAN_HASH_INVALID"],
    ];
    for (const [value, diagnostic] of cases) {
      expect(
        validateReportPlan(value, { maxRootWordShare: 0.5, maxTimingWordShare: 0.5 }).diagnostics,
      ).toContain(diagnostic);
    }
    expect(validateReportPlan(plan, { maxClaimsPerTheme: 0 }).diagnostics).toContain(
      "PLAN_THEME_CLAIM_LIMIT",
    );
  });
});
