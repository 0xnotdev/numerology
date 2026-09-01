import { describe, expect, it } from "vitest";
import {
  balliettBirthDate,
  calculateBundle,
  balliettName,
  expression,
  lifePath,
  westernAttitude,
  westernBirthday,
  westernBridges,
  westernDigitSumLifePath,
  westernExpression,
  westernHiddenPassion,
  westernKarmicLessons,
  westernLifePath,
  westernMaturity,
  westernPersonalMonths,
  westernPersonalYear,
  westernPersonality,
  westernSoulUrge,
} from "./index";

describe("Western and Balliett calculations", () => {
  it("exposes the concise core aliases used by the engine inventory", () => {
    expect(lifePath("1990-08-12").root).toBe(3);
    expect(expression("THOMAS CRUISE MAPOTHER").root).toBe(4);
  });

  it("matches the Decoz Life Path worked example with component traces", () => {
    const result = westernLifePath("1990-08-12");

    expect(result).toMatchObject({
      componentOutputs: [8, 3, 1],
      compound: 12,
      karmicDebts: [],
      root: 3,
    });
    expect(result.componentReductions.map((component) => component.steps)).toEqual([
      [8],
      [12, 3],
      [1990, 19, 10, 1],
    ]);
    expect(result.finalReduction.steps).toEqual([12, 3]);
  });

  it("keeps component and continuous Life Path profiles separate", () => {
    expect(westernLifePath("1940-09-26")).toMatchObject({
      componentOutputs: [9, 8, 5],
      compound: 22,
      preservedMaster: 22,
      root: 22,
    });
    expect(westernDigitSumLifePath("1940-09-26")).toMatchObject({
      compound: 31,
      preservedMaster: null,
      root: 4,
    });
  });

  it("matches handbook name, soul, and personality vectors with token-stage reductions", () => {
    expect(westernExpression("THOMAS CRUISE MAPOTHER")).toMatchObject({
      root: 4,
      tokenCompounds: [22, 30, 42],
      tokenOutputs: [22, 3, 6],
      total: 31,
    });
    expect(westernSoulUrge("THOMAS JOHN HANCOCK")).toMatchObject({
      root: 2,
      tokenCompounds: [7, 6, 7],
      tokenOutputs: [7, 6, 7],
      total: 20,
    });
    expect(westernPersonality("THOMAS JOHN HANCOCK")).toMatchObject({
      tokenCompounds: [15, 14, 21],
      tokenOutputs: [6, 5, 3],
      total: 14,
      root: 5,
    });
  });

  it("covers Western debt ordering, validation boundaries, and exact-root reductions", () => {
    expect(westernExpression("AAAAAAAAAAAAAA AAAAAAAAAAAAA").karmicDebts).toEqual([13, 14]);
    expect(westernHiddenPassion("NA")).toEqual([1, 5]);
    expect(westernPersonalYear("1990-01-09", 2026)).toMatchObject({ sunNumber: 1 });
    expect(() => westernExpression("   ")).toThrow(RangeError);
    expect(() => westernExpression("Aé")).toThrow(RangeError);
    expect(() => westernSoulUrge("Y")).toThrow(RangeError);
    expect(() => westernKarmicLessons("Aé")).toThrow(RangeError);
    expect(() => westernHiddenPassion("Aé")).toThrow(RangeError);
    expect(() => westernPersonalYear("1990-08-12", 0)).toThrow(RangeError);
    expect(() => westernPersonalYear("1990-08-12", 10000)).toThrow(RangeError);
  });

  it("calculates V1 derived Western metrics without interpreting them", () => {
    const lifePath = westernLifePath("1990-08-12");
    const expression = westernExpression("THOMAS CRUISE MAPOTHER");
    const soulUrge = westernSoulUrge("THOMAS JOHN HANCOCK");
    const personality = westernPersonality("THOMAS JOHN HANCOCK");

    expect(westernBirthday("1990-08-12")).toMatchObject({ compound: 12, root: 3 });
    expect(westernMaturity(lifePath, expression)).toMatchObject({ compound: 7, root: 7 });
    expect(westernAttitude("1990-08-12")).toMatchObject({ compound: 20, root: 2 });
    expect(westernKarmicLessons("ABC")).toEqual([4, 5, 6, 7, 8, 9]);
    expect(westernHiddenPassion("ANNA-MARIE")).toEqual([1, 5]);
    expect(westernBridges(lifePath, expression, soulUrge, personality)).toEqual({
      lifePathExpression: 1,
      soulPersonality: 3,
    });
  });

  it("retains Karmic Debt from an intermediate token reduction on the bundle path", () => {
    const result = westernExpression("ZZZZZZA");
    expect(result).toMatchObject({
      compound: 4,
      karmicDebts: [13],
      root: 4,
      tokenCompounds: [49],
      tokenOutputs: [4],
    });
    expect(result.tokenReductions[0]?.steps).toEqual([49, 13, 4]);

    const bundle = calculateBundle({
      asOfDate: "2026-08-31",
      civilDate: "1990-08-12",
      names: [{ id: "birth", kind: "birth_full", value: "ZZZZZZA" }],
      profiles: ["western_decoz_v1"],
      schemaVersion: "1.0.0",
    });
    expect(bundle.facts).toContainEqual(
      expect.objectContaining({
        factId: "western_decoz_v1.expression",
        compound: 4,
        karmicDebts: [13],
      }),
    );
  });

  it("does not misclassify a proven non-debt reduction or adjacent boundaries", () => {
    expect(westernExpression("ZZZZZZ")).toMatchObject({
      karmicDebts: [],
      tokenCompounds: [48],
      tokenReductions: [{ steps: [48, 12, 3] }],
    });
    expect(westernExpression("ZZZZZZB")).toMatchObject({
      karmicDebts: [],
      tokenCompounds: [50],
      tokenReductions: [{ steps: [50, 5] }],
    });
    expect(westernExpression("AAAAAAAAAAAA").karmicDebts).toEqual([]);
    expect(westernExpression("AAAAAAAAAAAAAA").karmicDebts).toEqual([14]);
  });

  it("attaches Karmic Debt when the final date compound is authorized", () => {
    expect(westernLifePath("1920-05-15")).toMatchObject({
      compound: 14,
      karmicDebts: [14],
      root: 5,
    });
    expect(westernLifePath("1904-09-27")).toMatchObject({
      compound: 23,
      karmicDebts: [],
      root: 5,
    });
  });

  it("calculates calendar-year Personal Year and all twelve Personal Months with no masters", () => {
    expect(westernPersonalYear("1990-08-12", 2026)).toMatchObject({
      compound: 12,
      root: 3,
      sunNumber: 2,
    });
    expect(westernPersonalMonths("1990-08-12", 2026).map((month) => month.root)).toEqual([
      4, 5, 6, 7, 8, 9, 1, 2, 3, 4, 5, 6,
    ]);
  });

  it("keeps Balliett worked examples as source evidence instead of modern Decoz masters", () => {
    expect(balliettBirthDate("1872-01-17")).toMatchObject({
      componentOutputs: [1, 8, 9],
      compound: 18,
      root: 9,
    });
    expect(balliettName("HENRY ELDER")).toMatchObject({
      root: 6,
      tokenOutputs: [7, 8],
      total: 15,
    });
  });
});
