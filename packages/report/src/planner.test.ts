import { parseRuleId } from "@numerology/doctrine";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  DEFAULT_PLANNER_POLICY,
  planReport,
  type ReportPlan,
  ReportPlanningError,
  stableReportPlan,
  validateReportPlan,
} from "./index";
import { BASE_RULE_SPECS, buildIntegrationFixture, type RuleFixtureSpec } from "./test-support";

const BALANCE_DISABLED = {
  maxRootWordShare: 1,
  maxTimingWordShare: 1,
  minimumIndependentProfileFamilies: 0,
} as const;

function expressionClaims(plan: ReportPlan) {
  return plan.claims.filter((claim) => claim.themeId === "expression");
}

function repeatedExpressionSpecs(count: number): RuleFixtureSpec[] {
  const base = BASE_RULE_SPECS[0];
  if (base === undefined) {
    throw new Error("Missing base rule spec.");
  }
  return Array.from({ length: count }, (_, index) => ({
    ...base,
    claims: [`Expression fixture ${String(index + 1).padStart(2, "0")}.`],
    ruleId: `RULE_EXPRESSION_${String(index + 1).padStart(2, "0")}`,
    sectionKey: "growth_edges",
  }));
}

describe("deterministic report planner", () => {
  it("retains the strict production editorial defaults", () => {
    expect(DEFAULT_PLANNER_POLICY).toEqual({
      maxActions: 5,
      maxClaimsPerTheme: 3,
      maxRootWordShare: 0.25,
      maxTimingWordShare: 0.2,
      minimumIndependentProfileFamilies: 3,
    });
    const fixture = buildIntegrationFixture();
    expect(() => planReport(fixture.bundle, fixture.evidence)).toThrow(
      new ReportPlanningError("INSUFFICIENT_INDEPENDENT_PROFILE_FAMILIES"),
    );
  });

  it("plans directly from doctrine evidence with complete branded identity and stable serialization", () => {
    const fixture = buildIntegrationFixture();
    const plan = planReport(fixture.bundle, fixture.evidence, BALANCE_DISABLED);
    const first = plan.claims[0];

    expectTypeOf(plan).toEqualTypeOf<ReportPlan>();
    expectTypeOf(first?.factIds[0]).toEqualTypeOf<
      (typeof fixture.evidence.evidence)[number]["factId"] | undefined
    >();
    expectTypeOf(first?.ruleIds[0]).toEqualTypeOf<
      (typeof fixture.evidence.evidence)[number]["ruleId"] | undefined
    >();
    expect(plan.planHash).toBe(
      "sha256:df4b7c4517c7a97a7b4c0f752d85c40df9611c8c6612a5c82b315d5c22ffb252",
    );
    expect(plan.evidenceResolutionHash).toBe(fixture.evidence.resolutionHash);
    expect(plan.reproducibility).toBe(fixture.evidence.reproducibility);
    expect(plan.resolutionTraces).toBe(fixture.evidence.traces);
    expect(plan.suppressions).toBe(fixture.evidence.suppressions);
    expect(first).toMatchObject({
      reviewState: "approved",
      sourceIds: ["SRC_REPORT_FIXTURE"],
    });
    expect(first?.factLinks[0]?.traceIds.length).toBeGreaterThan(0);
    expect(first?.sourceReferences[0]).toMatchObject({
      creator: "Numerology report integration fixture",
      sourceId: "SRC_REPORT_FIXTURE",
      sourceType: "product_policy",
      title: "Synthetic report doctrine",
    });
    expect(stableReportPlan(plan)).toBe(
      stableReportPlan(planReport(fixture.bundle, fixture.evidence, BALANCE_DISABLED)),
    );
    expect(validateReportPlan(plan)).toEqual({ diagnostics: [], valid: true });
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.claims[0])).toBe(true);
  });

  it("is invariant to doctrine authoring collection order", () => {
    const first = buildIntegrationFixture(BASE_RULE_SPECS);
    const second = buildIntegrationFixture([...BASE_RULE_SPECS].reverse());

    expect(planReport(second.bundle, second.evidence, BALANCE_DISABLED)).toEqual(
      planReport(first.bundle, first.evidence, BALANCE_DISABLED),
    );
  });

  it.each([
    [0, 0],
    [1, 1],
    [3, 3],
    [4, 4],
  ])("enforces maxClaimsPerTheme=%i at zero, one, and boundaries", (limit, expected) => {
    const fixture = buildIntegrationFixture(repeatedExpressionSpecs(4));
    const plan = planReport(fixture.bundle, fixture.evidence, {
      ...BALANCE_DISABLED,
      maxClaimsPerTheme: limit,
    });

    expect(expressionClaims(plan)).toHaveLength(expected);
    expect(plan.statistics.selectedClaimsByTheme.expression ?? 0).toBe(expected);
  });

  it("ranks overflow ties by branded rule ID and applies caps independently across themes", () => {
    const expression = repeatedExpressionSpecs(4);
    const structure = expression.slice(0, 3).map((spec, index) => ({
      ...spec,
      claims: [`Structure fixture ${index + 1}.`],
      constructive: ["structure"],
      ruleId: `RULE_STRUCTURE_${String(index + 1).padStart(2, "0")}`,
    }));
    const fixture = buildIntegrationFixture([...structure.reverse(), ...expression.reverse()]);
    const plan = planReport(fixture.bundle, fixture.evidence, {
      ...BALANCE_DISABLED,
      maxClaimsPerTheme: 2,
    });

    expect(expressionClaims(plan).flatMap((claim) => claim.ruleIds)).toEqual([
      "RULE_EXPRESSION_01",
      "RULE_EXPRESSION_02",
    ]);
    expect(plan.claims.filter((claim) => claim.themeId === "structure")).toHaveLength(2);
    expect(plan.statistics.selectedClaimsByTheme).toEqual({ expression: 2, structure: 2 });
  });

  it("retains mandatory contradiction warnings even when optional theme claims are capped at zero", () => {
    const fixture = buildIntegrationFixture(BASE_RULE_SPECS, [
      {
        contradiction_id: "CONTRA_NAME_METHODS",
        dimension: "name_mapping",
        position_a: "Cheiro table",
        position_b: "Johari table",
        profile_a: "cheiro_1926_v1",
        profile_b: "indian_johari_1990_v1",
        resolution: "Present both methods without averaging.",
      },
    ]);
    const plan = planReport(fixture.bundle, fixture.evidence, {
      ...BALANCE_DISABLED,
      maxClaimsPerTheme: 0,
    });

    expect(plan.claims).toHaveLength(1);
    expect(plan.claims[0]).toMatchObject({
      contradictionIds: ["CONTRA_NAME_METHODS"],
      relationship: "contradiction",
      ruleIds: ["RULE_CHEIRO_NAME", "RULE_JOHARI_PSYCHIC"],
      sectionKey: "methodology_appendix",
    });
    expect(plan.boundaryWarnings).toBe(fixture.evidence.boundaryWarnings);
  });

  it("carries suppression outcomes without discarding a rule that names targets", () => {
    const base = repeatedExpressionSpecs(1)[0];
    if (base === undefined) {
      throw new Error("Missing suppression base spec.");
    }
    const primary: RuleFixtureSpec = {
      ...base,
      ruleId: "RULE_PRIMARY",
      suppressesRuleIds: ["RULE_TARGET"],
    };
    const target: RuleFixtureSpec = {
      ...base,
      claims: ["Target claim."],
      ruleId: "RULE_TARGET",
    };
    const fixture = buildIntegrationFixture([target, primary]);
    const plan = planReport(fixture.bundle, fixture.evidence, BALANCE_DISABLED);

    expect(plan.claims.flatMap((claim) => claim.ruleIds)).toEqual(["RULE_PRIMARY"]);
    expect(plan.suppressions).toEqual([
      expect.objectContaining({
        suppressedRuleId: "RULE_TARGET",
        suppressingRuleId: "RULE_PRIMARY",
      }),
    ]);
    expect(
      plan.resolutionTraces.find((trace) => trace.ruleId === parseRuleId("RULE_TARGET")),
    ).toMatchObject({
      outcome: "suppressed",
      reason: "RULE_PRIMARY",
    });
  });

  it("enforces section, root, timing, valence, family, and action constraints deterministically", () => {
    const base = repeatedExpressionSpecs(1)[0];
    if (base === undefined) {
      throw new Error("Missing base rule.");
    }
    const tensionSpecs = Array.from({ length: 4 }, (_, index) => ({
      ...base,
      actionIds: [`reflect.tension-${index}`],
      claims: [`Tension ${index}.`],
      constructive: [],
      ruleId: `RULE_TENSION_${index}`,
      sectionKey: "growth_edges" as const,
      tensions: [`tension-${index}`],
    }));
    const fixture = buildIntegrationFixture([...BASE_RULE_SPECS, ...tensionSpecs]);
    const plan = planReport(fixture.bundle, fixture.evidence, {
      maxActions: 1,
      maxClaimsPerTheme: 3,
      maxRootWordShare: 1,
      maxTimingWordShare: 0.1,
      minimumIndependentProfileFamilies: 1,
    });

    expect(plan.actions).toHaveLength(1);
    expect(plan.claims.filter((claim) => claim.valence === "tension")).toHaveLength(1);
    expect(plan.statistics.timingWordBudget).toBe(0);
    expect(plan.sections.every((section) => section.reserved)).toBe(true);
    expect(plan.sections.map((section) => section.order)).toEqual(
      Array.from({ length: 18 }, (_, index) => index + 1),
    );
    expect(() =>
      planReport(fixture.bundle, fixture.evidence, {
        ...BALANCE_DISABLED,
        minimumIndependentProfileFamilies: 6,
      }),
    ).toThrow(new ReportPlanningError("INSUFFICIENT_INDEPENDENT_PROFILE_FAMILIES"));
  });

  it("fails closed on boundary identity drift and invalid policy values", () => {
    const fixture = buildIntegrationFixture();
    const drifted = {
      ...fixture.evidence,
      reproducibility: {
        ...fixture.evidence.reproducibility,
        inputHash: `sha256:${"0".repeat(64)}`,
      },
    };

    expect(() => planReport(fixture.bundle, drifted)).toThrow(
      new ReportPlanningError("EVIDENCE_REPRODUCIBILITY_MISMATCH"),
    );
    expect(() => planReport(fixture.bundle, fixture.evidence, { maxClaimsPerTheme: -1 })).toThrow(
      new ReportPlanningError("PLANNER_POLICY_INVALID"),
    );
  });

  it("reports durable-plan tampering without mutating the diagnostic result", () => {
    const fixture = buildIntegrationFixture();
    const plan = planReport(fixture.bundle, fixture.evidence, BALANCE_DISABLED);
    const tampered = {
      ...plan,
      planHash: `sha256:${"0".repeat(64)}`,
      sections: [...plan.sections].reverse(),
    };
    const result = validateReportPlan(tampered);

    expect(result.valid).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining(["PLAN_HASH_MISMATCH", "PLAN_SECTION_ORDER"]),
    );
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.diagnostics)).toBe(true);
  });
});
