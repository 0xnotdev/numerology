import { describe, expect, it } from "vitest";
import { evaluateCondition, evaluateConditions } from "./index";

const fact = {
  compound: 12,
  displayTokens: ["12", "3"],
  factId: "western_decoz_v1.life_path",
  metadata: { planet: "Jupiter", targetYear: 2026 },
  metricId: "life_path",
  occurrences: { "1": 2, "2": 0 },
  profileId: "western_decoz_v1",
  root: 3,
  traceIds: ["trace.1"],
} as const;

describe("allowlisted condition interpreter", () => {
  it("evaluates only declarative eq, contains, and gte operations", () => {
    expect(evaluateCondition({ op: "eq", path: "fact.root", value: 3 }, fact)).toBe(true);
    expect(
      evaluateCondition({ op: "contains", path: "fact.displayTokens", value: "12" }, fact),
    ).toBe(true);
    expect(evaluateCondition({ op: "gte", path: "fact.occurrences.1", value: 2 }, fact)).toBe(true);
    expect(
      evaluateCondition({ op: "eq", path: "fact.metadata.planet", value: "Jupiter" }, fact),
    ).toBe(true);
  });

  it("uses strict value semantics and fails closed for absent values", () => {
    expect(evaluateCondition({ op: "eq", path: "fact.root", value: "3" }, fact)).toBe(false);
    expect(evaluateCondition({ op: "gte", path: "fact.master", value: 1 }, fact)).toBe(false);
    expect(
      evaluateCondition({ op: "contains", path: "fact.displayTokens", value: "1" }, fact),
    ).toBe(false);
  });

  it("preserves equality and threshold properties across the supported numeric range", () => {
    for (let value = 0; value <= 60; value += 1) {
      expect(evaluateCondition({ op: "eq", path: "fact.compound", value }, fact)).toBe(
        value === fact.compound,
      );
      expect(evaluateCondition({ op: "gte", path: "fact.compound", value }, fact)).toBe(
        fact.compound >= value,
      );
    }
  });

  it("requires every condition and never evaluates arbitrary object paths", () => {
    expect(
      evaluateConditions(
        [
          { op: "eq", path: "fact.root", value: 3 },
          { op: "gte", path: "fact.compound", value: 12 },
        ],
        fact,
      ),
    ).toBe(true);
    expect(() =>
      evaluateCondition({ op: "eq", path: "fact.__proto__.polluted", value: "yes" } as never, fact),
    ).toThrowError(/UNSUPPORTED_CONDITION_PATH/u);
  });
});
