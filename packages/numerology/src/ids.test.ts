import { describe, expect, expectTypeOf, it } from "vitest";
import { parseCalculationBundle } from "./bundle-validation";
import { calculateFixture } from "./fixtures";
import { isFactId, parseFactId, type FactId } from "./ids";

describe("branded fact identifier boundary", () => {
  it("brands validated fact IDs and preserves them through bundle parsing", () => {
    const id = parseFactId("western_decoz_v1.life_path");
    const parsed = parseCalculationBundle(structuredClone(calculateFixture("G-W-LP-001").bundle));

    expectTypeOf(id).toEqualTypeOf<FactId>();
    expectTypeOf(parsed.facts[0]?.factId).toEqualTypeOf<FactId | undefined>();
    expect(parsed.facts[0]?.factId).toBe("western_decoz_v1.life_path");
    expect(Object.isFrozen(parsed.facts)).toBe(true);
  });

  it.each(["", "contains space", ".leading", "trailing.", "UPPERCASE"])(
    "rejects invalid fact ID %j",
    (value) => {
      expect(isFactId(value)).toBe(false);
      expect(() => parseFactId(value)).toThrow("INVALID_FACT_ID");
    },
  );
});
