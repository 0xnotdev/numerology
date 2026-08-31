import { describe, expect, it } from "vitest";
import { digitalRoot } from "./reduction";

describe("digitalRoot", () => {
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
});
