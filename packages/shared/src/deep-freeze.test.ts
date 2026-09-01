import { describe, expect, it } from "vitest";
import { deepFreeze } from "./deep-freeze";

describe("deepFreeze", () => {
  it("freezes nested arrays, symbol properties, and shared references in place", () => {
    const symbol = Symbol("nested");
    const shared = { enabled: true };
    const value = { nested: { values: [shared] }, [symbol]: shared };

    expect(deepFreeze(value)).toBe(value);
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.nested)).toBe(true);
    expect(Object.isFrozen(value.nested.values)).toBe(true);
    expect(Object.isFrozen(shared)).toBe(true);
  });

  it("terminates for cyclic graphs", () => {
    const value: { self?: unknown } = {};
    value.self = value;

    expect(deepFreeze(value)).toBe(value);
    expect(Object.isFrozen(value)).toBe(true);
  });

  it("leaves primitives and already frozen values unchanged", () => {
    const frozen = Object.freeze({ value: 1 });

    expect(deepFreeze(null)).toBeNull();
    expect(deepFreeze("value")).toBe("value");
    expect(deepFreeze(frozen)).toBe(frozen);
  });
});
