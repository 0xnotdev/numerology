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

  it("rejects malformed reduction policies", () => {
    expect(() => reduceWithPolicy(12, { masters: [12] as never, policyId: "" })).toThrow(
      RangeError,
    );
  });
});
