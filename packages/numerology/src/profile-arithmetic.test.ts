import { describe, expect, it } from "vitest";
import {
  CHEIRO_1926_ALPHABET,
  JOHARI_1990_ALPHABET,
  PROFILE_IDS,
  WESTERN_ALPHABET,
  mapCheiro1926,
  mapJohari1990,
  mapLetters,
  mapWestern,
  reduceWithPolicy,
} from "./index";

describe("profile-aware arithmetic", () => {
  it("preserves only metric-declared masters and keeps full reduction traces", () => {
    expect(reduceWithPolicy(29, { masters: [11, 22, 33], policyId: "western.core" })).toEqual({
      compound: 29,
      output: 11,
      preservedMaster: 11,
      steps: [29, 11],
    });
    expect(reduceWithPolicy(29, { masters: [], policyId: "forecast.no-master" })).toEqual({
      compound: 29,
      output: 2,
      preservedMaster: null,
      steps: [29, 11, 2],
    });
  });

  it("uses immutable alphabet tables and exposes Cheiro/Johari C-H-X divergence", () => {
    expect(Object.isFrozen(PROFILE_IDS)).toBe(true);
    expect(Object.isFrozen(WESTERN_ALPHABET)).toBe(true);
    expect(Object.isFrozen(WESTERN_ALPHABET.values)).toBe(true);
    expect(Object.isFrozen(CHEIRO_1926_ALPHABET.values)).toBe(true);
    expect(Object.isFrozen(JOHARI_1990_ALPHABET.values)).toBe(true);
    expect(mapWestern("CHX")).toMatchObject({
      compound: 17,
      root: 8,
    });
    expect(mapLetters("CHX", WESTERN_ALPHABET)).toMatchObject({
      compound: 17,
      letters: [
        { character: "C", value: 3 },
        { character: "H", value: 8 },
        { character: "X", value: 6 },
      ],
      root: 8,
    });
    expect(mapCheiro1926("CHX")).toMatchObject({
      compound: 13,
      root: 4,
    });
    expect(mapLetters("CHX", CHEIRO_1926_ALPHABET)).toMatchObject({
      compound: 13,
      letters: [
        { character: "C", value: 3 },
        { character: "H", value: 5 },
        { character: "X", value: 5 },
      ],
      root: 4,
    });
    expect(mapJohari1990("CHX")).toMatchObject({
      compound: 16,
      root: 7,
    });
    expect(mapLetters("CHX", JOHARI_1990_ALPHABET)).toMatchObject({
      compound: 16,
      letters: [
        { character: "C", value: 2 },
        { character: "H", value: 8 },
        { character: "X", value: 6 },
      ],
      root: 7,
    });
  });

  it("ignores only documented name separators for numeric totals", () => {
    expect(
      mapLetters("Anna-Marie O'Neil", WESTERN_ALPHABET).letters.map((letter) => letter.character),
    ).toEqual(["A", "N", "N", "A", "M", "A", "R", "I", "E", "O", "N", "E", "I", "L"]);
  });

  it("reports unsupported Latin letters without silently stripping them", () => {
    expect(mapLetters("José", WESTERN_ALPHABET).unsupported).toEqual([
      { character: "É", index: 3 },
    ]);
  });
});
