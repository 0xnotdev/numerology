import { describe, expect, it } from "vitest";
import { calculateBundle, validateBundle } from "./index";

const syntheticRequest = {
  asOfDate: "2026-04-15",
  civilDate: "1990-08-12",
  names: [
    { id: "birth", kind: "birth_full", value: "THOMAS CRUISE MAPOTHER" },
    { id: "popular", kind: "popular", value: "LLOYD GEORGE" },
  ],
  profiles: [
    "western_decoz_v1",
    "western_digit_sum_v1",
    "cheiro_1926_v1",
    "indian_johari_1990_v1",
    "loshu_raw_dob_v1",
    "loshu_indian_augmented_v1",
  ],
  schemaVersion: "1.0.0",
} as const;

describe("calculation bundle", () => {
  it("returns a deterministic, frozen, profile-aware bundle with canonical hashes", () => {
    const first = calculateBundle(syntheticRequest);
    const second = calculateBundle(syntheticRequest);

    expect(first).toEqual(second);
    expect(first.engineVersion).toBe("calc-1.0.0");
    expect(first.formulaManifestHash).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(first.inputHash).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.facts)).toBe(true);
    expect(Object.isFrozen(first.traces)).toBe(true);
    expect(validateBundle(first)).toEqual({ diagnostics: [], valid: true });

    expect(first.facts).toContainEqual(
      expect.objectContaining({
        factId: "western_decoz_v1.expression",
        metricId: "expression",
        profileId: "western_decoz_v1",
        root: 4,
      }),
    );
    expect(first.facts).toContainEqual(
      expect.objectContaining({
        factId: "cheiro_1926_v1.name_number",
        metricId: "name_number",
        profileId: "cheiro_1926_v1",
        root: 7,
      }),
    );
    expect(first.facts).toContainEqual(
      expect.objectContaining({
        factId: "loshu_raw_dob_v1.grid",
        metricId: "grid",
        occurrences: { "1": 2, "2": 1, "3": 0, "4": 0, "5": 0, "6": 0, "7": 0, "8": 1, "9": 2 },
        profileId: "loshu_raw_dob_v1",
      }),
    );
  });

  it("keeps raw and derived Lo Shu occurrences visible in the count trace", () => {
    const bundle = calculateBundle({
      asOfDate: "2026-04-15",
      civilDate: "1990-08-12",
      names: [],
      profiles: ["loshu_indian_augmented_v1"],
      schemaVersion: "1.0.0",
    });

    expect(bundle.traces).toContainEqual(
      expect.objectContaining({
        operation: "count_digits",
        intermediates: [1, 9, 9, 8, 1, 2, 3, 3],
        output: 8,
      }),
    );
  });

  it("does not mutate the request while normalizing or calculating", () => {
    const request = {
      ...syntheticRequest,
      names: syntheticRequest.names.map((name) => ({ ...name })),
      profiles: [...syntheticRequest.profiles],
    };
    const before = JSON.stringify(request);

    calculateBundle(request);

    expect(JSON.stringify(request)).toBe(before);
  });

  it("validates failure paths without leaking private name text in warnings", () => {
    expect(() => calculateBundle({ ...syntheticRequest, civilDate: "2001-02-29" })).toThrow(
      RangeError,
    );
    expect(() =>
      calculateBundle({ ...syntheticRequest, profiles: ["unknown_profile"] as never }),
    ).toThrow(RangeError);

    const bundle = calculateBundle({
      asOfDate: "2026-04-15",
      civilDate: "1990-08-12",
      names: [{ id: "birth", kind: "birth_full", script: "Deva", value: "श्रेया पटनायक" }],
      profiles: ["western_decoz_v1"],
      schemaVersion: "1.0.0",
    });

    expect(bundle.warnings).toContainEqual(
      expect.objectContaining({ code: "ENGINE_LATIN_NAME_REQUIRED", inputRef: "name:birth" }),
    );
    expect(JSON.stringify(bundle.warnings)).not.toContain("श्रेया");
    expect(bundle.facts.map((fact) => fact.metricId)).toContain("life_path");
    expect(bundle.facts.map((fact) => fact.metricId)).not.toContain("expression");
  });

  it("marks an empty vowel or consonant subset as not applicable", () => {
    const bundle = calculateBundle({
      asOfDate: "2026-04-15",
      civilDate: "1990-08-12",
      names: [{ id: "birth", kind: "birth_full", value: "BC" }],
      profiles: ["western_decoz_v1"],
      schemaVersion: "1.0.0",
    });

    expect(bundle.facts.map((fact) => fact.metricId)).toContain("personality");
    expect(bundle.facts.map((fact) => fact.metricId)).not.toContain("soul_urge");
    expect(bundle.warnings).toContainEqual(
      expect.objectContaining({
        code: "NAME_METRIC_NOT_APPLICABLE",
        metadata: { metricId: "soul_urge" },
      }),
    );
  });

  it("requires occurrence-level Y classification for Western vowel metrics", () => {
    const ambiguous = calculateBundle({
      asOfDate: "2026-04-15",
      civilDate: "1990-08-12",
      names: [{ id: "birth", kind: "birth_full", value: "LYDIA" }],
      profiles: ["western_decoz_v1"],
      schemaVersion: "1.0.0",
    });
    expect(ambiguous.warnings).toContainEqual(
      expect.objectContaining({ code: "WESTERN_Y_CLASSIFICATION_REQUIRED" }),
    );
    expect(ambiguous.facts.map((fact) => fact.metricId)).not.toContain("soul_urge");

    const classified = calculateBundle({
      asOfDate: "2026-04-15",
      civilDate: "1990-08-12",
      names: [
        {
          id: "birth",
          kind: "birth_full",
          value: "LYDIA",
          yClassifications: { "1": "vowel" },
        },
      ],
      profiles: ["western_decoz_v1"],
      schemaVersion: "1.0.0",
    });
    expect(
      classified.warnings.some((warning) => warning.code === "WESTERN_Y_CLASSIFICATION_REQUIRED"),
    ).toBe(false);
    expect(classified.facts).toContainEqual(
      expect.objectContaining({ metricId: "soul_urge", root: 8 }),
    );
    expect(classified.facts).toContainEqual(
      expect.objectContaining({ metricId: "personality", root: 7 }),
    );
  });

  it("calculates a customer-confirmed Latin transliteration without exposing the source script", () => {
    const bundle = calculateBundle({
      asOfDate: "2026-04-15",
      civilDate: "1990-08-12",
      names: [
        {
          calculationText: "SHREYA PATNAIK",
          id: "birth",
          kind: "birth_full",
          script: "Deva",
          transliteration: {
            scheme: "customer-confirmed-latin",
            userConfirmed: true,
            version: "1",
          },
          value: "श्रेया पटनायक",
        },
      ],
      profiles: ["western_decoz_v1"],
      schemaVersion: "1.0.0",
    });

    expect(bundle.facts).toContainEqual(expect.objectContaining({ metricId: "expression" }));
    expect(bundle.warnings).not.toContainEqual(
      expect.objectContaining({ code: "ENGINE_TRANSLITERATION_CONFIRMATION_REQUIRED" }),
    );
    expect(JSON.stringify(bundle.warnings)).not.toContain("श्रेया");
  });

  it("diagnoses missing trace references in malformed bundles", () => {
    const bundle = calculateBundle(syntheticRequest);
    const malformed = {
      ...bundle,
      facts: [{ ...bundle.facts[0], traceIds: ["missing-trace"] }],
    };

    expect(validateBundle(malformed).valid).toBe(false);
    expect(validateBundle(malformed).diagnostics).toContain("missing trace: missing-trace");
  });

  it("returns diagnostics rather than throwing for structurally malformed bundles", () => {
    expect(
      validateBundle({
        engineVersion: "calc-1.0.0",
        facts: [null],
        traces: [null],
      }).valid,
    ).toBe(false);
    expect(
      validateBundle({
        engineVersion: "calc-1.0.0",
        facts: [{ factId: "fact", profileId: "western_decoz_v1", traceIds: null }],
        traces: [],
      }).valid,
    ).toBe(false);
  });

  it("rejects malformed trace, fact, and warning fields", () => {
    const bundle = calculateBundle(syntheticRequest);
    const malformed = {
      ...bundle,
      traces: [{ ...bundle.traces[0], policyId: "", intermediates: ["not-a-number"] }],
      facts: [{ ...bundle.facts[0], displayTokens: [3], compound: -1, master: 12 }],
      warnings: [{ warningId: "warning", message: "", policyId: "", code: "not-a-warning" }],
    };

    const result = validateBundle(malformed);
    expect(result.valid).toBe(false);
    expect(result.diagnostics.some((diagnostic) => diagnostic.includes("policyId"))).toBe(true);
  });

  it("rejects future and underage civil dates relative to explicit as-of date", () => {
    expect(() =>
      calculateBundle({ ...syntheticRequest, civilDate: "2027-01-01", asOfDate: "2026-04-15" }),
    ).toThrow(RangeError);
    expect(() =>
      calculateBundle({ ...syntheticRequest, civilDate: "2010-04-16", asOfDate: "2026-04-15" }),
    ).toThrow(RangeError);
  });

  it("rejects malformed requests with a domain validation error", () => {
    expect(() => calculateBundle(null as never)).toThrow(RangeError);
    expect(() => calculateBundle({ ...syntheticRequest, schemaVersion: "0.0.0" as never })).toThrow(
      RangeError,
    );
    expect(() => calculateBundle({ ...syntheticRequest, civilDate: 1 as never })).toThrow(
      RangeError,
    );
    expect(() => calculateBundle({ ...syntheticRequest, names: undefined as never })).toThrow(
      RangeError,
    );
    expect(() => calculateBundle({ ...syntheticRequest, profiles: [] })).toThrow(RangeError);
    expect(() => calculateBundle({ ...syntheticRequest, profiles: [12] as never })).toThrow(
      RangeError,
    );
    expect(() =>
      calculateBundle({ ...syntheticRequest, profiles: ["western_decoz_v1", "western_decoz_v1"] }),
    ).toThrow(RangeError);
    expect(() =>
      calculateBundle({
        ...syntheticRequest,
        names: [
          { id: "same", kind: "birth_full", value: "A" },
          { id: "same", kind: "popular", value: "B" },
        ],
      }),
    ).toThrow(RangeError);
    expect(() => calculateBundle({ ...syntheticRequest, names: [null] as never })).toThrow(
      RangeError,
    );
  });
});
