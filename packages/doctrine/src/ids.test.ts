import { describe, expect, expectTypeOf, it } from "vitest";
import {
  isActionId,
  isRuleId,
  isSourceId,
  parseActionId,
  parseRuleId,
  parseSourceId,
  type ActionId,
  type RuleId,
  type SourceId,
} from "./ids";

describe("branded doctrine identifiers", () => {
  it("brands identifiers only at validated boundaries", () => {
    expectTypeOf(parseRuleId("RULE_1")).toEqualTypeOf<RuleId>();
    expectTypeOf(parseSourceId("SRC_1")).toEqualTypeOf<SourceId>();
    expectTypeOf(parseActionId("reflect.pause")).toEqualTypeOf<ActionId>();
    expect(isRuleId("RULE_1")).toBe(true);
    expect(isSourceId("SRC_1")).toBe(true);
    expect(isActionId("reflect.pause")).toBe(true);
    expect(parseActionId("a")).toBe("a");
  });

  it.each([
    [parseRuleId, "lower.rule", "INVALID_RULE_ID"],
    [parseRuleId, "xRULE_1", "INVALID_RULE_ID"],
    [parseRuleId, "RULE_1x!", "INVALID_RULE_ID"],
    [parseSourceId, "source space", "INVALID_SOURCE_ID"],
    [parseSourceId, "xSRC_1!", "INVALID_SOURCE_ID"],
    [parseSourceId, "SRC_1!x", "INVALID_SOURCE_ID"],
    [parseActionId, "Action.UPPER", "INVALID_ACTION_ID"],
    [parseActionId, "xreflect.pause!", "INVALID_ACTION_ID"],
    [parseActionId, "reflect.pause!x", "INVALID_ACTION_ID"],
  ] as const)("rejects invalid identifiers", (parse, value, code) => {
    expect(() => parse(value)).toThrow(code);
  });

  it("rejects nonstrings and malformed values in identifier predicates", () => {
    for (const value of [null, 1, {}, "xRULE_1!", "RULE_1!x", "lower"] as const) {
      expect(isRuleId(value)).toBe(false);
    }
    for (const value of [null, 1, {}, "xSRC_1!", "SRC_1!x", "lower"] as const) {
      expect(isSourceId(value)).toBe(false);
    }
    for (const value of [null, 1, {}, "xreflect.pause!", "reflect.pause!x", "UPPER"] as const) {
      expect(isActionId(value)).toBe(false);
    }
    expect(() => parseRuleId(null)).toThrow("INVALID_RULE_ID: null");
  });
});
