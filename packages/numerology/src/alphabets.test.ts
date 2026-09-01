import { describe, expect, it } from "vitest";
import {
  assertSupportedLatinMapping,
  mapCheiro1926,
  mapJohari1990,
  mapLetters,
  mapWestern,
  WESTERN_ALPHABET,
} from "./index";

describe("alphabet mapping boundaries", () => {
  it("keeps documented separators out of all alphabet sums and exposes wrappers", () => {
    const western = mapWestern(" A-B'C\tD\nE. ");

    expect(western.compound).toBe(15);
    expect(western.letters.map((letter) => letter.character)).toEqual(["A", "B", "C", "D", "E"]);
    expect(mapCheiro1926("A").alphabetId).toBe("cheiro_1926_latin_v1");
    expect(mapJohari1990("A").alphabetId).toBe("johari_unit_system_v1");
    expect(Object.isFrozen(western)).toBe(true);
    expect(Object.isFrozen(western.letters)).toBe(true);
  });

  it("retains unsupported characters and rejects unsupported or empty mappings", () => {
    const mapped = mapLetters("A🙂", WESTERN_ALPHABET);

    expect(mapped.letters).toHaveLength(1);
    expect(mapped.unsupported).toEqual([{ character: "🙂", index: 1 }]);
    expect(() => assertSupportedLatinMapping(mapped)).toThrow(RangeError);
    expect(() => assertSupportedLatinMapping(mapLetters(" ", WESTERN_ALPHABET))).toThrow(
      RangeError,
    );
  });
});
