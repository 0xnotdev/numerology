import { calculateFixture } from "@numerology/engine";
import { describe, expect, it } from "vitest";
import {
  conditionPathDefinition,
  evaluateCondition,
  evaluateTrigger,
  parseTrigger,
} from "./conditions";

const fact = calculateFixture("G-W-LP-001").bundle.facts.find(
  (candidate) => candidate.metricId === "life_path",
);
if (fact === undefined) {
  throw new Error("Fixture has no Life Path fact.");
}

describe("closed doctrine trigger language", () => {
  it("exposes the exact allowlisted path type/operator matrix", () => {
    const expected = {
      "fact.compound": ["number", ["eq", "gte"]],
      "fact.displayTokens": ["string_collection", ["contains"]],
      "fact.factId": ["string", ["eq"]],
      "fact.master": ["number", ["eq", "gte"]],
      "fact.metadata.month": ["number", ["eq", "gte"]],
      "fact.metadata.personalYearRoot": ["number", ["eq", "gte"]],
      "fact.metadata.planet": ["string", ["eq"]],
      "fact.metadata.targetYear": ["number", ["eq", "gte"]],
      "fact.metadata.weekday": ["string", ["eq"]],
      "fact.metadata.weekdayValue": ["number", ["eq", "gte"]],
      "fact.metadata.yearSuffix": ["number", ["eq", "gte"]],
      "fact.metricId": ["string", ["eq"]],
      "fact.profileId": ["string", ["eq"]],
      "fact.root": ["number", ["eq", "gte"]],
      "fact.occurrences.1": ["number", ["eq", "gte"]],
    } as const;
    for (const [path, [kind, operators]] of Object.entries(expected)) {
      const definition = conditionPathDefinition(path);
      expect(definition?.kind, path).toBe(kind);
      expect([...(definition?.operators ?? [])], path).toEqual(operators);
    }
    expect(conditionPathDefinition("x.fact.occurrences.1")).toBeNull();
    expect(conditionPathDefinition("fact.occurrences.1x")).toBeNull();
  });

  it("evaluates equality, numeric thresholds, collections, and AND semantics", () => {
    expect(evaluateCondition({ op: "eq", path: "fact.root", value: 3 }, fact)).toBe(true);
    expect(evaluateCondition({ op: "gte", path: "fact.compound", value: 12 }, fact)).toBe(true);
    expect(
      evaluateCondition({ op: "contains", path: "fact.displayTokens", value: "3" }, fact),
    ).toBe(true);
    expect(evaluateCondition({ op: "eq", path: "fact.metadata.month", value: 8 }, fact)).toBe(
      false,
    );
    expect(evaluateCondition({ op: "gte", path: "fact.occurrences.1", value: 1 }, fact)).toBe(
      false,
    );
    expect(
      evaluateTrigger({ all: [{ op: "eq", path: "fact.metricId", value: "life_path" }] }, fact),
    ).toBe(true);
    expect(
      evaluateTrigger(
        {
          all: [
            { op: "eq", path: "fact.root", value: 3 },
            { op: "eq", path: "fact.metricId", value: "wrong" },
          ],
        },
        fact,
      ),
    ).toBe(false);
  });

  it.each([
    [{}, "INVALID_TRIGGER"],
    [{ all: [] }, "INVALID_TRIGGER"],
    [{ all: [{ op: "eq", path: "fact.root" }] }, "INVALID_CONDITION"],
    [{ all: [{ op: "execute", path: "fact.root", value: 3 }] }, "INVALID_CONDITION"],
    [{ all: [{ op: "eq", path: "fact.constructor", value: "x" }] }, "UNSUPPORTED_PATH"],
    [{ all: [{ op: "contains", path: "fact.root", value: "3" }] }, "UNSUPPORTED_PATH_OPERATOR"],
    [{ all: [{ op: "gte", path: "fact.root", value: "3" }] }, "INVALID_CONDITION_VALUE"],
  ])("fails closed for trigger %j", (trigger, code) => {
    const parsed = parseTrigger(trigger);
    expect(parsed.diagnostics.some((item) => item.code === code)).toBe(true);
  });

  it("evaluates every closed scalar path and both absent/present metadata branches", () => {
    const richFact = {
      ...fact,
      compound: 12,
      master: 11 as const,
      metadata: {
        month: 8,
        personalYearRoot: 4,
        planet: "Jupiter",
        targetYear: 2026,
        weekday: "Monday",
        weekdayValue: 2,
        yearSuffix: 26,
      },
      occurrences: { "1": 2 },
    };
    const cases = [
      ["fact.compound", 12],
      ["fact.factId", richFact.factId],
      ["fact.master", 11],
      ["fact.metricId", "life_path"],
      ["fact.profileId", "western_decoz_v1"],
      ["fact.root", 3],
      ["fact.metadata.month", 8],
      ["fact.metadata.personalYearRoot", 4],
      ["fact.metadata.planet", "Jupiter"],
      ["fact.metadata.targetYear", 2026],
      ["fact.metadata.weekday", "Monday"],
      ["fact.metadata.weekdayValue", 2],
      ["fact.metadata.yearSuffix", 26],
      ["fact.occurrences.1", 2],
    ] as const;
    for (const [path, value] of cases) {
      expect(evaluateCondition({ op: "eq", path, value }, richFact)).toBe(true);
    }
    expect(evaluateCondition({ op: "eq", path: "fact.metadata.planet", value: "Mars" }, fact)).toBe(
      false,
    );
    expect(evaluateCondition({ op: "gte", path: "fact.root", value: Number.NaN }, fact)).toBe(
      false,
    );
  });

  it("returns exact deterministic trigger diagnostics", () => {
    expect(parseTrigger({})).toEqual({
      diagnostics: [
        {
          code: "INVALID_TRIGGER",
          message: "trigger must be an object containing only a non-empty all array.",
          path: "trigger",
        },
      ],
    });
    expect(parseTrigger({ all: [] })).toEqual({
      diagnostics: [
        {
          code: "INVALID_TRIGGER",
          message: "trigger.all cannot be empty.",
          path: "trigger.all",
        },
      ],
    });
    expect(parseTrigger({ all: [{ op: "eq", path: "fact.root" }] }).diagnostics[0]).toEqual({
      code: "INVALID_CONDITION",
      message: "A condition must contain exactly op, path, and value.",
      path: "trigger.all.0",
    });
    expect(parseTrigger({ all: [{ op: 1, path: "fact.root", value: 3 }] }).diagnostics[0]).toEqual({
      code: "INVALID_CONDITION",
      message: "Condition path and op must be strings.",
      path: "trigger.all.0",
    });
    expect(
      parseTrigger({ all: [{ op: "eq", path: "fact.constructor", value: "x" }] }).diagnostics[0],
    ).toEqual({
      code: "UNSUPPORTED_PATH",
      message: "Condition path is not allowlisted: fact.constructor.",
      path: "trigger.all.0",
    });
    expect(
      parseTrigger({ all: [{ op: "execute", path: "fact.root", value: 3 }] }).diagnostics[0],
    ).toEqual({
      code: "INVALID_CONDITION",
      message: "Unsupported condition operator: execute.",
      path: "trigger.all.0",
    });
    expect(
      parseTrigger({ all: [{ op: "contains", path: "fact.root", value: "3" }] }).diagnostics[0],
    ).toEqual({
      code: "UNSUPPORTED_PATH_OPERATOR",
      message: "contains is not supported for fact.root.",
      path: "trigger.all.0",
    });
    expect(
      parseTrigger({ all: [{ op: "gte", path: "fact.root", value: "3" }] }).diagnostics[0],
    ).toEqual({
      code: "INVALID_CONDITION_VALUE",
      message: "Condition value for fact.root must be a finite number.",
      path: "trigger.all.0",
    });
    expect(
      parseTrigger({
        all: [{ op: "contains", path: "fact.displayTokens", value: "3" }],
      }),
    ).toEqual({
      conditions: [{ op: "contains", path: "fact.displayTokens", value: "3" }],
      diagnostics: [],
    });
  });

  it("rejects malformed records, malformed fact values, and invalid compiled triggers", () => {
    expect(parseTrigger(1).diagnostics[0]?.code).toBe("INVALID_TRIGGER");
    expect(parseTrigger([]).diagnostics[0]?.code).toBe("INVALID_TRIGGER");
    expect(parseTrigger({ all: [null] }).diagnostics[0]?.code).toBe("INVALID_CONDITION");
    expect(
      parseTrigger({ all: [{ op: 1, path: "fact.root", value: 3 }] }).diagnostics[0]?.code,
    ).toBe("INVALID_CONDITION");
    expect(
      parseTrigger({ all: [{ op: "gte", path: "fact.root", value: Number.POSITIVE_INFINITY }] })
        .diagnostics[0]?.code,
    ).toBe("INVALID_CONDITION_VALUE");
    expect(() => evaluateTrigger({}, fact)).toThrow("INVALID_COMPILED_TRIGGER");
    const stringCollectionFact = { ...fact, displayTokens: "3" } as unknown as typeof fact;
    const stringRootFact = { ...fact, root: "3" } as unknown as typeof fact;
    expect(
      evaluateCondition(
        { op: "contains", path: "fact.displayTokens", value: "3" },
        stringCollectionFact,
      ),
    ).toBe(false);
    expect(evaluateCondition({ op: "gte", path: "fact.root", value: 1 }, stringRootFact)).toBe(
      false,
    );
  });

  it("rejects direct evaluation of a non-allowlisted path/operator", () => {
    expect(conditionPathDefinition("fact.constructor")).toBeNull();
    expect(() =>
      evaluateCondition({ op: "eq", path: "fact.constructor", value: "x" }, fact),
    ).toThrow("UNSUPPORTED_CONDITION_PATH: fact.constructor/eq");
    expect(() =>
      evaluateCondition({ op: "contains", path: "fact.root", value: "3" }, fact),
    ).toThrow("UNSUPPORTED_CONDITION_PATH: fact.root/contains");
  });
});
