import { createDoctrineRegistry } from "@numerology/doctrine";
import { calculateBundle } from "@numerology/engine";
import { planReport, stableReportPlan, validateReportPlan } from "@numerology/report";
import { describe, expect, it } from "vitest";
import {
  BASE_RULE_SPECS,
  buildIntegrationFixture,
  REPORT_FIXTURE_REQUEST,
  type RuleFixtureSpec,
} from "./test-support";

describe("calculation -> doctrine -> report contract", () => {
  it("runs the real package exports with identity, suppression, conflict, cap, and stable bytes", () => {
    const target: RuleFixtureSpec = {
      claims: ["This lower-priority duplicate must be suppressed."],
      constructive: ["expression"],
      metricId: "life_path",
      profileId: "western_decoz_v1",
      ruleId: "RULE_SUPPRESSED_DUPLICATE",
      sectionKey: "life_path",
    };
    const specs = BASE_RULE_SPECS.map((spec) =>
      spec.ruleId === "RULE_WESTERN_LIFE_PATH"
        ? { ...spec, suppressesRuleIds: [target.ruleId] }
        : spec,
    );
    const compiled = buildIntegrationFixture(
      [...specs, target],
      [
        {
          contradiction_id: "CONTRA_E2E_NAME_TABLES",
          dimension: "name_table",
          position_a: "Cheiro mapping",
          position_b: "Johari mapping",
          profile_a: "cheiro_1926_v1",
          profile_b: "indian_johari_1990_v1",
          resolution: "Keep both sourced methods visible and never average them.",
        },
      ],
    ).release;

    const calculateResolvePlan = () => {
      const bundle = calculateBundle(REPORT_FIXTURE_REQUEST);
      const evidence = createDoctrineRegistry(compiled).resolve(bundle, {
        asOfDate: "2026-04-15",
        locale: "en",
      });
      const plan = planReport(bundle, evidence, {
        maxClaimsPerTheme: 2,
        maxRootWordShare: 1,
        maxTimingWordShare: 1,
        minimumIndependentProfileFamilies: 1,
      });
      return { bundle, evidence, plan };
    };

    const first = calculateResolvePlan();
    const second = calculateResolvePlan();
    expect(first.evidence.suppressions).toEqual([
      expect.objectContaining({
        suppressedRuleId: "RULE_SUPPRESSED_DUPLICATE",
        suppressingRuleId: "RULE_WESTERN_LIFE_PATH",
      }),
    ]);
    expect(first.plan.suppressions).toBe(first.evidence.suppressions);
    expect(first.plan.resolutionTraces).toBe(first.evidence.traces);
    expect(first.plan.reproducibility).toMatchObject({
      calculationBundleHash: expect.stringMatching(/^sha256:/u),
      engineVersion: first.bundle.engineVersion,
      formulaManifestHash: first.bundle.formulaManifestHash,
      inputHash: first.bundle.inputHash,
    });
    expect(first.plan.claims.filter((claim) => claim.themeId === "expression")).toHaveLength(2);
    expect(first.plan.claims.find((claim) => claim.relationship === "contradiction")).toMatchObject(
      {
        contradictionIds: ["CONTRA_E2E_NAME_TABLES"],
        factIds: expect.arrayContaining([
          "cheiro_1926_v1.name_number",
          "indian_johari_1990_v1.psychic_number",
        ]),
        sourceIds: ["SRC_REPORT_FIXTURE"],
      },
    );
    for (const claim of first.plan.claims) {
      expect(claim.factIds.length).toBeGreaterThan(0);
      expect(claim.factLinks.every((link) => link.traceIds.length > 0)).toBe(true);
      expect(claim.ruleIds.length).toBeGreaterThan(0);
      expect(claim.sourceIds.length).toBeGreaterThan(0);
      expect(claim.sourceReferences.every((reference) => reference.locator.length > 0)).toBe(true);
    }
    expect(first.plan.claims.map((claim) => claim.claimId)).toEqual(
      second.plan.claims.map((claim) => claim.claimId),
    );
    expect(stableReportPlan(second.plan)).toBe(stableReportPlan(first.plan));
    expect(second.plan.planHash).toBe(first.plan.planHash);
    expect(validateReportPlan(first.plan)).toEqual({ diagnostics: [], valid: true });
  });
});
