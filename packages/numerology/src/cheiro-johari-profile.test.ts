import { describe, expect, it } from "vitest";
import {
  calculateBundle,
  cheiroBirth,
  cheiroDateMetrics,
  cheiroMonth,
  cheiroName,
  cheiroYear,
  destiny,
  johariCore,
  johariNameNumber,
  nameNumber,
  psychic,
  johariYearDigitSum,
  johariProjectedYear,
  planetForRoot,
} from "./index";

describe("Cheiro and Johari calculations", () => {
  it("matches Cheiro's token-reduced Lloyd George name example", () => {
    expect(cheiroName("LLOYD GEORGE")).toMatchObject({
      root: 7,
      tokenCompounds: [18, 25],
      tokenRoots: [9, 7],
      total: 16,
    });
  });

  it("keeps Cheiro birth, month, and year separate and never creates a full-date Life Path", () => {
    expect(cheiroBirth("1866-06-06")).toEqual({ compound: 6, root: 6 });
    expect(cheiroMonth("1866-06-06")).toEqual({ compound: 6, root: 6 });
    expect(cheiroYear("1866-06-06")).toEqual({ compound: 21, root: 3 });
    expect(cheiroDateMetrics("1866-06-06")).toEqual({
      birth: { compound: 6, root: 6 },
      month: { compound: 6, root: 6 },
      year: { compound: 21, root: 3 },
    });

    const bundle = calculateBundle({
      asOfDate: "2026-08-31",
      civilDate: "1866-06-06",
      names: [{ id: "popular", kind: "popular", value: "LLOYD GEORGE" }],
      profiles: ["cheiro_1926_v1"],
      schemaVersion: "1.0.0",
    });

    expect(bundle.facts.map((fact) => fact.metricId)).not.toContain("life_path");
    expect(bundle.traces).toContainEqual(
      expect.objectContaining({
        operation: "reduce",
        intermediates: [7],
        output: 7,
        policyId: "cheiro_1926_v1.name_number.final",
      }),
    );
  });

  it("matches Johari Psychic, Destiny, Name, planet, and projected-year rules", () => {
    expect(psychic("1934-05-12")).toEqual({ compound: 12, root: 3 });
    expect(destiny("1934-05-12")).toEqual({ compound: 25, root: 7 });
    expect(nameNumber("CHX")).toMatchObject({ compound: 16, root: 7 });
    expect(johariCore("1934-05-12")).toEqual({
      destiny: { compound: 25, root: 7 },
      psychic: { compound: 12, root: 3 },
    });
    expect(johariNameNumber("CHX")).toMatchObject({
      compound: 16,
      root: 7,
      values: [2, 8, 6],
    });
    expect(planetForRoot(1)).toBe("Sun");
    expect(planetForRoot(4)).toBe("Rahu");
    expect(planetForRoot(9)).toBe("Mars");
    expect(johariProjectedYear({ birthDay: 12, birthMonth: 5, targetYear: 1991 })).toEqual({
      compound: 109,
      root: 1,
      weekday: "Sunday",
      yearSuffix: 91,
      weekdayValue: 1,
    });

    const bundle = calculateBundle({
      asOfDate: "1991-01-01",
      civilDate: "1934-05-12",
      names: [{ id: "popular", kind: "popular", value: "CHX" }],
      profiles: ["indian_johari_1990_v1"],
      schemaVersion: "1.0.0",
    });
    expect(bundle.facts).toContainEqual(
      expect.objectContaining({
        factId: "indian_johari_1990_v1.projected_year",
        compound: 109,
        root: 1,
        metadata: { targetYear: 1991, weekday: "Sunday", weekdayValue: 1, yearSuffix: 91 },
      }),
    );
    expect(bundle.traces).toContainEqual(
      expect.objectContaining({
        operation: "reduce",
        intermediates: [7],
        output: 7,
        policyId: "indian_johari_1990_v1.name_number.final",
      }),
    );
  });

  it("rejects empty or invalid name/date projection inputs", () => {
    expect(() => cheiroName("   ")).toThrow(RangeError);
    expect(() => cheiroName("🙂")).toThrow(RangeError);
    expect(() => johariNameNumber("   ")).toThrow(RangeError);
    expect(() => planetForRoot(0)).toThrow(RangeError);
    expect(() => planetForRoot(10)).toThrow(RangeError);
    expect(() => johariProjectedYear({ birthDay: 12, birthMonth: 5, targetYear: 0 })).toThrow(
      RangeError,
    );
    expect(() => johariProjectedYear({ birthDay: 31, birthMonth: 2, targetYear: 2026 })).toThrow(
      RangeError,
    );
    expect(johariYearDigitSum(2026)).toBe(10);
  });

  it("emits an explicit Johari pre-dawn boundary exclusion warning in V1 bundles", () => {
    const bundle = calculateBundle({
      asOfDate: "2026-08-31",
      civilDate: "1934-05-12",
      names: [{ id: "popular", kind: "popular", value: "CHX" }],
      profiles: ["indian_johari_1990_v1"],
      schemaVersion: "1.0.0",
    });

    expect(bundle.warnings).toContainEqual(
      expect.objectContaining({
        code: "JOHARI_PREDAWN_BOUNDARY_EXCLUDED",
        profileId: "indian_johari_1990_v1",
      }),
    );
  });
});
