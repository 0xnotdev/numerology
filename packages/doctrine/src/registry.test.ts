import { calculateFixture } from "@numerology/engine";
import { describe, expect, expectTypeOf, it } from "vitest";
import { compileDoctrine } from "./compiler";
import { parseRuleId, type ActionId, type RuleId, type SourceId } from "./ids";
import {
  createDoctrineRegistry,
  type ResolvedEvidenceBundle,
  stableResolvedEvidenceBundle,
} from "./registry";
import { bindingFor, validAuthoring, validRule } from "./test-fixtures";

const bundle = calculateFixture("G-W-LP-001").bundle;

function withBlockedAction() {
  const release = validAuthoring();
  const action = release.actions[0];
  if (action === undefined) {
    throw new Error("Missing test action.");
  }
  return validAuthoring({ actions: [{ ...action, status: "blocked" }] });
}

function withUnsafeAction(kind: "language" | "tag") {
  const release = validAuthoring();
  const action = release.actions[0];
  if (action === undefined) {
    throw new Error("Missing test action.");
  }
  return validAuthoring({
    actions: [
      {
        ...action,
        ...(kind === "language"
          ? { instructions: { en: ["This is a guaranteed outcome."] } }
          : { safety_tags: ["medical"] }),
      },
    ],
  });
}

function withBlockedSource() {
  const release = validAuthoring();
  const source = release.sources[0];
  if (source === undefined) {
    throw new Error("Missing test source.");
  }
  return validAuthoring({ sources: [{ ...source, status: "blocked" }] });
}

describe("resolved evidence contract", () => {
  it("exports complete immutable report-ready evidence with branded provenance and reproducibility", () => {
    const release = validAuthoring({
      contradictions: [
        {
          contradiction_id: "CONTRA_SYNTHETIC",
          dimension: "test_boundary",
          position_a: "one",
          position_b: "two",
          profile_a: "western_decoz_v1",
          profile_b: "western_decoz_v1",
          resolution: "show_boundary",
        },
      ],
    });
    const result = createDoctrineRegistry(compileDoctrine(release).release).resolve(bundle, {
      asOfDate: "2026-08-31",
      locale: "en",
    });

    expectTypeOf(result).toEqualTypeOf<ResolvedEvidenceBundle>();
    expectTypeOf(result.evidence[0]?.ruleId).toEqualTypeOf<RuleId | undefined>();
    expectTypeOf(result.evidence[0]?.sourceIds[0]).toEqualTypeOf<SourceId | undefined>();
    expectTypeOf(result.evidence[0]?.actionIds[0]).toEqualTypeOf<ActionId | undefined>();
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0]).toMatchObject({
      actionIds: ["reflect.pause"],
      claimClass: "C",
      claims: [expect.stringContaining("bounded prompt")],
      factId: "western_decoz_v1.life_path",
      reviewState: "approved",
      reviewers: ["editor@example.test", "safety@example.test"],
      ruleId: "RULE_WESTERN_LP_3",
      safetyTags: ["agency", "reflective"],
      sectionKey: "core.life_path",
      sourceIds: ["SRC_TEST"],
      sourceReferences: [
        { extractionNote: "Synthetic doctrine test locator.", sourceId: "SRC_TEST" },
      ],
      suppressesRuleIds: [],
      themes: { constructive: ["expression"], tensions: ["scattering"] },
    });
    expect(result.evidence[0]?.calculationTraceIds.length).toBeGreaterThan(0);
    expect(result.traces[0]).toMatchObject({
      actionIds: ["reflect.pause"],
      factId: "western_decoz_v1.life_path",
      outcome: "selected",
      ruleId: "RULE_WESTERN_LP_3",
      sourceIds: ["SRC_TEST"],
    });
    expect(result.reproducibility).toMatchObject({
      asOfDate: "2026-08-31",
      doctrineReleaseId: release.release_id,
      engineVersion: bundle.engineVersion,
      formulaManifestHash: bundle.formulaManifestHash,
      inputHash: bundle.inputHash,
      locale: "en",
    });
    expect(result.boundaryWarnings).toHaveLength(1);
    expect(result.resolutionHash).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(stableResolvedEvidenceBundle(result)).toContain(result.resolutionHash);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.evidence[0]?.sourceReferences)).toBe(true);
  });

  it("treats suppresses_rule_ids as targets suppressed by a matching rule, never as self-discard", () => {
    const primary = validRule({ rule_id: parseRuleId("RULE_PRIMARY") });
    const secondary = validRule({ rule_id: parseRuleId("RULE_SECONDARY") });
    const release = validAuthoring({
      bindings: [
        bindingFor(primary.rule_id, { suppresses_rule_ids: [secondary.rule_id] }),
        bindingFor(secondary.rule_id),
      ],
      rules: [secondary, primary],
    });

    const result = createDoctrineRegistry(compileDoctrine(release).release).resolve(bundle, {
      asOfDate: "2026-08-31",
      locale: "en",
    });

    expect(result.evidence.map((item) => item.ruleId)).toEqual(["RULE_PRIMARY"]);
    expect(result.evidence[0]?.suppressesRuleIds).toEqual(["RULE_SECONDARY"]);
    expect(result.suppressions).toEqual([
      {
        suppressedFactId: "western_decoz_v1.life_path",
        suppressedRuleId: "RULE_SECONDARY",
        suppressingFactId: "western_decoz_v1.life_path",
        suppressingRuleId: "RULE_PRIMARY",
      },
    ]);
    expect(result.omissions).toEqual([]);
    expect(result.traces.find((trace) => trace.ruleId === secondary.rule_id)).toMatchObject({
      outcome: "suppressed",
      reason: "RULE_PRIMARY",
    });
  });

  it("uses the highest-precedence matching suppressor deterministically", () => {
    const target = validRule({ rule_id: parseRuleId("RULE_TARGET") });
    const preferred = validRule({ confidence: "high", rule_id: parseRuleId("RULE_PREFERRED") });
    const fallback = validRule({ confidence: "low", rule_id: parseRuleId("RULE_FALLBACK") });
    const release = validAuthoring({
      bindings: [
        bindingFor(target.rule_id),
        bindingFor(fallback.rule_id, { suppresses_rule_ids: [target.rule_id] }),
        bindingFor(preferred.rule_id, { suppresses_rule_ids: [target.rule_id] }),
      ],
      rules: [target, fallback, preferred],
    });

    const result = createDoctrineRegistry(compileDoctrine(release).release).resolve(bundle, {
      asOfDate: "2026-08-31",
      locale: "en",
    });
    expect(result.suppressions[0]?.suppressingRuleId).toBe("RULE_PREFERRED");
  });

  it.each([
    ["blocked actions", withBlockedAction(), "BLOCKED_ACTION"],
    ["blocked sources", withBlockedSource(), "BLOCKED_SOURCE"],
    [
      "unsafe tags",
      validAuthoring({ bindings: [bindingFor(undefined, { safety_tags: ["medical"] })] }),
      "UNSAFE_RULE",
    ],
    [
      "unsafe claim language",
      validAuthoring({ rules: [validRule({ safe_paraphrases: ["This will cure anything."] })] }),
      "UNSAFE_RULE",
    ],
    ["unsafe action tags", withUnsafeAction("tag"), "UNSAFE_RULE"],
    ["unsafe action language", withUnsafeAction("language"), "UNSAFE_RULE"],
    [
      "unresolved confidence",
      validAuthoring({ rules: [validRule({ confidence: "unresolved" })] }),
      "UNRESOLVED_CONFIDENCE",
    ],
    [
      "non-active status",
      validAuthoring({
        rules: [
          {
            ...validRule({ review_state: "unreviewed", reviewers: [], status: "draft" }),
            content_hash: null,
          },
        ],
      }),
      "INVALID_STATUS",
    ],
  ])("fails closed for %s", (_name, authoring, code) => {
    const result = createDoctrineRegistry(compileDoctrine(authoring).release).resolve(bundle, {
      asOfDate: "2026-08-31",
      locale: "en",
    });

    expect(result.evidence).toEqual([]);
    expect(result.omissions.map((item) => item.code)).toContain(code);
    expect(result.traces[0]).toMatchObject({ outcome: "omitted", reason: code });
  });

  it("does not match a valid rule for a different locale or false wildcard condition", () => {
    const hindiRule = validRule({ locale: "hi" });
    const hindiRelease = validAuthoring({ locales: ["en", "hi"], rules: [hindiRule] });
    const action = hindiRelease.actions[0];
    if (action === undefined) {
      throw new Error("Missing action.");
    }
    const withHindiAction = validAuthoring({
      actions: [{ ...action, instructions: { ...action.instructions, hi: ["रुकें"] } }],
      locales: ["en", "hi"],
      rules: [hindiRule],
    });
    expect(
      createDoctrineRegistry(compileDoctrine(withHindiAction).release).resolve(bundle, {
        asOfDate: "2026-08-31",
        locale: "en",
      }).evidence,
    ).toEqual([]);

    const falseWildcard = validRule({
      trigger: { all: [{ op: "gte", path: "fact.root", value: 9 }] },
    });
    expect(
      createDoctrineRegistry(
        compileDoctrine(validAuthoring({ rules: [falseWildcard] })).release,
      ).resolve(bundle, { asOfDate: "2026-08-31", locale: "en" }).evidence,
    ).toEqual([]);
  });

  it("enforces validity dates and rejects malformed inputs and options", () => {
    const registry = createDoctrineRegistry(compileDoctrine(validAuthoring()).release);
    expect(
      registry.resolve(bundle, { asOfDate: "2027-01-01", locale: "en" }).omissions[0]?.code,
    ).toBe("OUTSIDE_VALIDITY");
    expect(
      registry.resolve(bundle, { asOfDate: "2025-12-31", locale: "en" }).omissions[0]?.code,
    ).toBe("OUTSIDE_VALIDITY");
    expect(() => registry.resolve({}, { asOfDate: "2026-08-31", locale: "en" })).toThrow(
      "INVALID_CALCULATION_BUNDLE",
    );
    for (const asOfDate of ["bad-date", "2026-13-01", "2026-01-00", "2026-02-30"]) {
      expect(() => registry.resolve(bundle, { asOfDate, locale: "en" })).toThrow(
        "INVALID_AS_OF_DATE",
      );
    }
    expect(() => registry.resolve(bundle, { asOfDate: "2026-08-31", locale: "hi" })).toThrow(
      "UNSUPPORTED_DOCTRINE_LOCALE",
    );
    expect(() => createDoctrineRegistry({})).toThrow("COMPILED_SCHEMA_INVALID");
  });
});
