import { describe, expect, it } from "vitest";
import {
  augmentedGrid,
  evaluateTriples,
  loShuAugmentedGrid,
  loShuDigits,
  loShuRawGrid,
  rawGrid,
} from "./index";

describe("Lo Shu raw and Indian-augmented grids", () => {
  it("matches the raw DOB grid handbook example and preserves zero handling", () => {
    const grid = loShuRawGrid("1990-08-12");

    expect(rawGrid("1990-08-12")).toEqual(grid);
    expect(grid.counts).toEqual({ 1: 2, 2: 1, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 1, 9: 2 });
    expect(grid.ignoredZeros).toBe(2);
    expect(grid.occurrences).toEqual([
      { digit: 1, source: "year[0]", sourceType: "raw" },
      { digit: 9, source: "year[1]", sourceType: "raw" },
      { digit: 9, source: "year[2]", sourceType: "raw" },
      { digit: 8, source: "month[1]", sourceType: "raw" },
      { digit: 1, source: "day[0]", sourceType: "raw" },
      { digit: 2, source: "day[1]", sourceType: "raw" },
    ]);
    expect(grid.lines).toContainEqual({ id: "LS-L2", state: "empty", triple: [3, 5, 7] });
    expect(grid.lines).toContainEqual({ id: "LS-L5", state: "partial", triple: [9, 5, 1] });
    expect(grid.lines).toContainEqual({ id: "LS-L7", state: "empty", triple: [4, 5, 6] });
    expect(grid.lines.filter((line) => line.state === "complete")).toHaveLength(0);
  });

  it("calculates the augmented comparison as raw counts plus visible Psychic/Destiny events", () => {
    const raw = loShuRawGrid("1990-08-12");
    const augmented = loShuAugmentedGrid("1990-08-12");

    expect(augmentedGrid("1990-08-12")).toEqual(augmented);
    expect(evaluateTriples(raw.counts)).toEqual(raw.lines);
    expect(augmented.counts).toEqual({ 1: 2, 2: 1, 3: 2, 4: 0, 5: 0, 6: 0, 7: 0, 8: 1, 9: 2 });
    expect(augmented.augmentationEvents).toEqual([
      { digit: 3, source: "psychic_root", sourceType: "derived" },
      { digit: 3, source: "destiny_root", sourceType: "derived" },
    ]);
    expect(raw.counts).toEqual({ 1: 2, 2: 1, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 1, 9: 2 });
  });

  it("returns nine fixed cells and eight stable line triples for every valid date", () => {
    const grid = loShuRawGrid("2000-02-29");

    expect(Object.keys(grid.counts).sort()).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9"]);
    expect(grid.lines).toHaveLength(8);
    expect(grid.ignoredZeros).toBe(4);
  });

  it("does not expose mutable geometry or digit constants", () => {
    const grid = loShuRawGrid("1990-08-12");

    expect(Object.isFrozen(grid.lines[0]?.triple)).toBe(true);
    expect(Object.isFrozen(loShuDigits())).toBe(true);
    expect(() => ((grid.lines[0]?.triple as unknown as number[])[0] = 1)).toThrow(TypeError);
    expect(() => (loShuDigits() as unknown as number[]).push(1)).toThrow(TypeError);
  });
});
