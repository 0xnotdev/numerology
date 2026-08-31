import { calculateBundle, calculateFixture } from "@numerology/engine";
import { describe, expect, it } from "vitest";
import {
  compileDoctrine,
  createDoctrineRegistry,
  indexRuleIds,
  STARTER_DOCTRINE_AUTHORING,
  validateCompiledDoctrine,
} from "./index";
import { validAuthoring, validRule } from "./test-fixtures";

const expectedStarterHash =
  "sha256:5288187f7f2d30c600a68f23eabdd5c50636f2bc1f24f511b852e57313e47114";

describe("deterministic doctrine registry", () => {
  it("compiles authoritative root and contradiction fixtures into a canonical release", () => {
    const compiled = compileDoctrine(STARTER_DOCTRINE_AUTHORING);

    expect(compiled.release.schemaVersion).toBe("1.0.0");
    expect(compiled.release.rules).toHaveLength(10);
    expect(compiled.release.contradictions).toHaveLength(18);
    expect(compiled.release.contradictions).toContainEqual(
      expect.objectContaining({
        contradictionId: "CONTRA-MAP-001",
        positionA: "C3_H5_X5",
        positionB: "C2_H8_X6",
        profileA: "cheiro_1926_v1",
        profileB: "indian_johari_1990_v1",
      }),
    );
    expect(compiled.release.releaseHash).toBe(expectedStarterHash);
    expect(compiled.manifest.doctrineHash).toBe(expectedStarterHash);
    expect(compiled.canonicalJson).toBe(JSON.stringify(JSON.parse(compiled.canonicalJson)));
    expect(validateCompiledDoctrine(compiled.release)).toEqual({ diagnostics: [], valid: true });
  });

  it("normalizes authoring collection order and object-key order before hashing", () => {
    const first = compileDoctrine(STARTER_DOCTRINE_AUTHORING);
    const reordered = compileDoctrine({
      ...STARTER_DOCTRINE_AUTHORING,
      actions: [...STARTER_DOCTRINE_AUTHORING.actions].reverse(),
      contradictions: [...STARTER_DOCTRINE_AUTHORING.contradictions].reverse(),
      rules: [...STARTER_DOCTRINE_AUTHORING.rules].reverse().map((rule) => ({
        ...rule,
        claims: { or: rule.claims.or, hi: rule.claims.hi, en: rule.claims.en },
        conditions: [...rule.conditions].reverse(),
        sourceRefs: [...rule.sourceRefs].reverse(),
      })),
      sources: [...STARTER_DOCTRINE_AUTHORING.sources].reverse(),
    });

    expect(reordered.release.releaseHash).toBe(first.release.releaseHash);
    expect(reordered.canonicalJson).toBe(first.canonicalJson);
    expect(reordered.manifest).toEqual(first.manifest);
  });

  it("uses the deterministic profile/metric/root index and resolves a validated engine fixture", () => {
    const compiled = compileDoctrine(STARTER_DOCTRINE_AUTHORING);
    expect(indexRuleIds(compiled.release.index, "western_decoz_v1", "life_path", 3)).toContain(
      "western.life-path.3.v1",
    );
    expect(indexRuleIds(compiled.release.index, "western_decoz_v1", "life_path", 8)).not.toContain(
      "western.life-path.3.v1",
    );

    const bundle = calculateFixture("G-W-LP-001").bundle;
    const resolution = createDoctrineRegistry(compiled.release).resolve(bundle, { locale: "en" });

    expect(resolution.matches).toContainEqual(
      expect.objectContaining({
        factId: "western_decoz_v1.life_path",
        profileId: "western_decoz_v1",
        ruleId: "western.life-path.3.v1",
        sourceRefs: [
          expect.objectContaining({
            evidenceClass: "derived_product_policy",
            sourceId: "SRC-POLICY-ROOT-ONTOLOGY",
          }),
        ],
        themes: expect.arrayContaining(["expression", "creativity", "sociability"]),
      }),
    );
    expect(resolution.resolutionHash).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(Object.isFrozen(resolution)).toBe(true);
  });

  it("surfaces an applicable machine-readable school contradiction as a boundary warning", () => {
    const compiled = compileDoctrine(STARTER_DOCTRINE_AUTHORING);
    const bundle = calculateFixture("D-MAP-001").bundle;
    const resolution = createDoctrineRegistry(compiled.release).resolve(bundle, { locale: "en" });

    expect(resolution.boundaryWarnings).toContainEqual(
      expect.objectContaining({
        contradictionId: "CONTRA-MAP-001",
        resolution: "immutable_table_id",
      }),
    );
  });

  it("fails closed on an invalid calculation bundle or a tampered compiled release", () => {
    const compiled = compileDoctrine(STARTER_DOCTRINE_AUTHORING);
    const registry = createDoctrineRegistry(compiled.release);
    const malformedBundle = { ...calculateFixture("G-W-LP-001").bundle, inputHash: "bad" };

    expect(() => registry.resolve(malformedBundle, { locale: "en" })).toThrowError(
      /INVALID_CALCULATION_BUNDLE/u,
    );
    expect(() =>
      createDoctrineRegistry({ ...compiled.release, releaseId: "tampered" }),
    ).toThrowError(/INVALID_COMPILED_DOCTRINE/u);
  });

  it("filters blocked, deprecated, unsafe, unpromoted experimental/low-confidence, and blocked-action rules", () => {
    const rules = [
      validRule({ ruleId: "filter.safe.v1" }),
      validRule({ ruleId: "filter.blocked.v1", status: "blocked" }),
      validRule({ ruleId: "filter.deprecated.v1", status: "deprecated" }),
      validRule({ ruleId: "filter.experimental.v1", status: "experimental" }),
      validRule({ confidence: "low", ruleId: "filter.low.v1" }),
      validRule({ ruleId: "filter.unsafe.v1", safetyTags: ["medical"] }),
      validRule({
        claims: { en: ["Guaranteed wealth follows from this number."], hi: [], or: [] },
        ruleId: "filter.unsafe-claim.v1",
      }),
      validRule({ actionKeys: ["reflect.blocked"], ruleId: "filter.blocked-action.v1" }),
    ].map((rule, index) => ({
      ...rule,
      conditions: [...rule.conditions, { op: "gte" as const, path: "fact.compound", value: index }],
    }));
    const compiled = compileDoctrine(
      validAuthoring({
        actions: [
          ...validAuthoring().actions,
          {
            actionKey: "reflect.blocked",
            instructions: { en: ["This action is unavailable."] },
            safetyTags: ["reflective"],
            status: "blocked",
            version: "1.0.0",
          },
        ],
        rules,
      }),
    );
    const bundle = calculateFixture("G-W-LP-001").bundle;
    const resolution = createDoctrineRegistry(compiled.release).resolve(bundle, { locale: "en" });

    expect(resolution.matches.map((match) => match.ruleId)).toEqual(["filter.safe.v1"]);
    expect(resolution.excluded.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "BLOCKED_ACTION",
        "BLOCKED_STATUS",
        "DEPRECATED_STATUS",
        "EXPERIMENTAL_NOT_PROMOTED",
        "LOW_CONFIDENCE_NOT_PROMOTED",
        "UNSAFE_RULE",
      ]),
    );
  });

  it("allows an explicit release promotion for experimental and low-confidence rules", () => {
    const rules = [
      validRule({ ruleId: "promoted.experimental.v1", status: "experimental" }),
      validRule({
        confidence: "low",
        conditions: [
          { op: "eq", path: "fact.root", value: 3 },
          { op: "gte", path: "fact.compound", value: 1 },
        ],
        ruleId: "promoted.low.v1",
      }),
    ];
    const compiled = compileDoctrine(
      validAuthoring({
        promotions: ["promoted.experimental.v1", "promoted.low.v1"],
        rules,
      }),
    );
    const result = createDoctrineRegistry(compiled.release).resolve(
      calculateFixture("G-W-LP-001").bundle,
      { locale: "en" },
    );

    expect(result.matches.map((match) => match.ruleId)).toEqual([
      "promoted.experimental.v1",
      "promoted.low.v1",
    ]);
  });

  it("applies authored exclusions deterministically", () => {
    const preferred = validRule({
      exclusions: ["root3.secondary.v1"],
      ruleId: "root3.preferred.v1",
    });
    const secondary = validRule({
      conditions: [
        { op: "eq", path: "fact.root", value: 3 },
        { op: "gte", path: "fact.compound", value: 1 },
      ],
      ruleId: "root3.secondary.v1",
    });
    const compiled = compileDoctrine(validAuthoring({ rules: [secondary, preferred] }));
    const result = createDoctrineRegistry(compiled.release).resolve(
      calculateFixture("G-W-LP-001").bundle,
      { locale: "en" },
    );

    expect(result.matches.map((match) => match.ruleId)).toEqual(["root3.preferred.v1"]);
    expect(result.excluded).toContainEqual(
      expect.objectContaining({ code: "EXCLUDED_BY_RULE", ruleId: "root3.secondary.v1" }),
    );
  });

  it("is byte-stable when a valid bundle's facts, traces, and metadata keys are reordered", () => {
    const compiled = compileDoctrine(STARTER_DOCTRINE_AUTHORING);
    const registry = createDoctrineRegistry(compiled.release);
    const bundle = calculateBundle({
      asOfDate: "2026-04-15",
      civilDate: "1990-08-12",
      names: [],
      profiles: ["western_decoz_v1", "cheiro_1926_v1"],
      schemaVersion: "1.0.0",
    });
    const reordered = {
      ...bundle,
      facts: [...bundle.facts]
        .reverse()
        .map((fact) =>
          fact.metadata === undefined
            ? fact
            : { ...fact, metadata: Object.fromEntries(Object.entries(fact.metadata).reverse()) },
        ),
      traces: [...bundle.traces].reverse(),
      warnings: [...bundle.warnings].reverse(),
    };

    const first = registry.resolve(bundle, { locale: "en" });
    const second = registry.resolve(reordered, { locale: "en" });
    expect(second).toEqual(first);
    expect(second.resolutionHash).toBe(first.resolutionHash);
  });
});
