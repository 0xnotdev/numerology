import { describe, expect, it } from "vitest";
import { digitalRoot, reduceComponents, reduceDigits, reduceWithPolicy } from "./reduction";

describe("digitalRoot", () => {
  it("exposes the calculation-engine reduceDigits name without changing the trace", () => {
    expect(reduceDigits(29)).toEqual({ input: 29, steps: [29, 11, 2], value: 2 });
  });

  it("reduces components before summing them under the selected policy", () => {
    expect(
      reduceComponents([8, 12, 1990], { masters: [11, 22, 33], policyId: "date" }),
    ).toMatchObject({
      componentOutputs: [8, 3, 1],
      compound: 12,
      root: 3,
    });
  });

  it.each([
    [0, 0, [0]],
    [7, 7, [7]],
    [29, 2, [29, 11, 2]],
    [1990, 1, [1990, 19, 10, 1]],
  ])("reduces %i to %i with an auditable trace", (input, expected, steps) => {
    expect(digitalRoot(input)).toEqual({ input, steps, value: expected });
  });

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1])("rejects invalid input %s", (input) => {
    expect(() => digitalRoot(input)).toThrow(RangeError);
  });

  it("preserves configured masters and rejects malformed reduction policies", () => {
    expect(reduceWithPolicy(22, { masters: [11, 22, 33], policyId: "masters" })).toEqual({
      compound: 22,
      output: 22,
      preservedMaster: 22,
      steps: [22],
    });
    expect(reduceWithPolicy(49, { masters: [11, 22, 33], policyId: "debt" }).steps).toEqual([
      49, 13, 4,
    ]);
    expect(() => reduceWithPolicy(12, { masters: [12] as never, policyId: "valid" })).toThrow(
      RangeError,
    );
    expect(() => reduceWithPolicy(12, { masters: [11, 11], policyId: "duplicate" })).toThrow(
      RangeError,
    );
    expect(() => reduceWithPolicy(12, { masters: [], policyId: "" })).toThrow(RangeError);
    expect(() => reduceComponents([] as never, { masters: [], policyId: "empty" })).toThrow(
      RangeError,
    );
    expect(() => reduceComponents(null as never, { masters: [], policyId: "null" })).toThrow(
      RangeError,
    );
  });
});
