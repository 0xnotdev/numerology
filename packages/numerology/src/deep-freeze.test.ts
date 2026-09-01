import { describe, expect, it } from "vitest";
import { deepFreeze } from "./deep-freeze";

describe("deepFreeze", () => {
  it("freezes nested objects and arrays without changing the value", () => {
    const value = { nested: { values: [1, { enabled: true }] } };

    expect(deepFreeze(value)).toBe(value);
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.nested)).toBe(true);
    expect(Object.isFrozen(value.nested.values)).toBe(true);
    expect(Object.isFrozen(value.nested.values[1])).toBe(true);
  });

  it("leaves primitives and already frozen values unchanged", () => {
    const frozen = Object.freeze({ value: 1 });

    expect(deepFreeze(null)).toBeNull();
    expect(deepFreeze("value")).toBe("value");
    expect(deepFreeze(frozen)).toBe(frozen);
  });
});
