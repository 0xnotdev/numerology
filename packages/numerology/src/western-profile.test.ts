import { describe, expect, it } from "vitest";
import {
  balliettBirthDate,
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

  it("attaches Karmic Debt only when the authorized compound appears", () => {
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
