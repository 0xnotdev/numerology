import { describe, expect, it } from "vitest";
import {
  currentCivilDate,
  hasContextualY,
  needsLatinSpelling,
  validateAdultBirthDate,
  yOccurrences,
} from "./intake-validation";

describe("intake validation policy", () => {
  it("uses the supplied civil as-of date for the adult boundary", () => {
    const asOfDate = "2026-09-03";

    expect(validateAdultBirthDate("2008-09-03", asOfDate)).toBeNull();
    expect(validateAdultBirthDate("2008-09-04", asOfDate)).toBe("underage");
    expect(validateAdultBirthDate("2026-09-03", asOfDate)).toBe("underage");
    expect(validateAdultBirthDate("2026-02-30", asOfDate)).toBe("invalid");
  });

  it("exposes contextual name branches without guessing a script or Y sound", () => {
    expect(needsLatinSpelling("आर्या")).toBe(true);
    expect(needsLatinSpelling("Riya")).toBe(false);
    expect(hasContextualY("Riya")).toBe(true);
    expect(hasContextualY("Asha")).toBe(false);
    expect(yOccurrences("Yaya")).toEqual([0, 2]);
    expect(yOccurrences("आर्या", "Arya")).toEqual([2]);
    expect(yOccurrences("आर्या")).toEqual([]);
  });

  it("uses the India business date around UTC midnight", () => {
    expect(currentCivilDate(new Date("2026-09-03T23:59:59.000Z"))).toBe("2026-09-04");
    expect(currentCivilDate(new Date("2026-09-04T00:00:00.000Z"))).toBe("2026-09-04");
  });
});
