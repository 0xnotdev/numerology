import { describe, expect, it } from "vitest";
import {
  civilDateDigitOccurrences,
  digitsOfInteger,
  parseCivilDate,
  sumDigits,
  utcGregorianDate,
  yearFromAsOfDate,
} from "./index";

describe("Gregorian date normalization", () => {
  it("accepts leap dates and dates in the first Gregorian centuries", () => {
    expect(parseCivilDate("2000-02-29")).toMatchObject({ year: 2000, month: 2, day: 29 });
    expect(parseCivilDate("0001-01-01")).toMatchObject({ year: 1, month: 1, day: 1 });
  });

  it.each(["1900-02-29", "2001-02-29", "2026-13-01", "2026-01-00", "20260831"])(
    "rejects non-Gregorian date %s",
    (value) => {
      expect(() => parseCivilDate(value)).toThrow(RangeError);
    },
  );

  it("rejects invalid date parts and numeric inputs", () => {
    expect(() => utcGregorianDate(2026, 0, 1)).toThrow(RangeError);
    expect(() => utcGregorianDate(2026, 13, 1)).toThrow(RangeError);
    expect(() => utcGregorianDate(2026, 1, 0)).toThrow(RangeError);
    expect(() => utcGregorianDate(2026.5, 1, 1)).toThrow(RangeError);
    expect(() => parseCivilDate(null as never)).toThrow(RangeError);
    expect(() => digitsOfInteger(-1)).toThrow(RangeError);
    expect(() => digitsOfInteger(1.5)).toThrow(RangeError);
    expect(sumDigits(1900)).toBe(10);
    expect(yearFromAsOfDate("2026-08-31")).toBe(2026);
  });

  it("retains padded zero positions in the extraction trace", () => {
    expect(civilDateDigitOccurrences("2000-02-09")).toEqual([
      { digit: 2, source: "year[0]" },
      { digit: 0, source: "year[1]" },
      { digit: 0, source: "year[2]" },
      { digit: 0, source: "year[3]" },
      { digit: 0, source: "month[0]" },
      { digit: 2, source: "month[1]" },
      { digit: 0, source: "day[0]" },
      { digit: 9, source: "day[1]" },
    ]);
  });
});
