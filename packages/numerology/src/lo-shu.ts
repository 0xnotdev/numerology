import { civilDateDigitOccurrences } from "./date";
import { johariCore } from "./johari";
import type { Digit } from "./types";

export type LoShuLineState = "complete" | "empty" | "partial";
export type LoShuSourceType = "derived" | "raw";

export interface LoShuOccurrence {
  readonly digit: Digit;
  readonly source: string;
  readonly sourceType: LoShuSourceType;
}

export interface LoShuLine {
  readonly id: string;
  readonly state: LoShuLineState;
  readonly triple: readonly [Digit, Digit, Digit];
}

export interface LoShuGrid {
  readonly augmentationEvents?: readonly LoShuOccurrence[];
  readonly counts: Readonly<Record<Digit, number>>;
  readonly ignoredZeros: number;
  readonly lines: readonly LoShuLine[];
  readonly occurrences: readonly LoShuOccurrence[];
}

const DIGITS = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9] as const);

function line(
  id: string,
  triple: [Digit, Digit, Digit],
): {
  readonly id: string;
  readonly triple: readonly [Digit, Digit, Digit];
} {
  return Object.freeze({ id, triple: Object.freeze(triple) });
}

const LINE_TRIPLES = Object.freeze([
  line("LS-L1", [4, 9, 2]),
  line("LS-L2", [3, 5, 7]),
  line("LS-L3", [8, 1, 6]),
  line("LS-L4", [4, 3, 8]),
  line("LS-L5", [9, 5, 1]),
  line("LS-L6", [2, 7, 6]),
  line("LS-L7", [4, 5, 6]),
  line("LS-L8", [2, 5, 8]),
]);

function emptyCounts(): Record<Digit, number> {
  return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 };
}

function freezeCounts(counts: Record<Digit, number>): Readonly<Record<Digit, number>> {
  return Object.freeze({ ...counts });
}

export function evaluateLoShuLines(counts: Readonly<Record<Digit, number>>): readonly LoShuLine[] {
  return Object.freeze(
    LINE_TRIPLES.map(({ id, triple }) => {
      const present = triple.filter((digit) => counts[digit] > 0).length;
      const state: LoShuLineState =
        present === 3 ? "complete" : present === 0 ? "empty" : "partial";
      return Object.freeze({ id, state, triple });
    }),
  );
}

function fromOccurrences(
  occurrences: readonly LoShuOccurrence[],
  ignoredZeros: number,
  augmentationEvents?: readonly LoShuOccurrence[],
): LoShuGrid {
  const counts = emptyCounts();
  for (const occurrence of occurrences) {
    counts[occurrence.digit] += 1;
  }
  const frozenCounts = freezeCounts(counts);
  const base = {
    counts: frozenCounts,
    ignoredZeros,
    lines: evaluateLoShuLines(frozenCounts),
    occurrences: Object.freeze([...occurrences]),
  };
  if (augmentationEvents !== undefined) {
    return Object.freeze({
      ...base,
      augmentationEvents: Object.freeze([...augmentationEvents]),
    });
  }
  return Object.freeze(base);
}

export function loShuRawGrid(date: string): LoShuGrid {
  let ignoredZeros = 0;
  const occurrences: LoShuOccurrence[] = [];
  for (const occurrence of civilDateDigitOccurrences(date)) {
    if (occurrence.digit === 0) {
      ignoredZeros += 1;
      continue;
    }
    occurrences.push(
      Object.freeze({
        digit: occurrence.digit as Digit,
        source: occurrence.source,
        sourceType: "raw" as const,
      }),
    );
  }

  return fromOccurrences(occurrences, ignoredZeros);
}

export function loShuAugmentedGrid(date: string): LoShuGrid {
  const raw = loShuRawGrid(date);
  const johari = johariCore(date);
  const augmentationEvents: LoShuOccurrence[] = [
    Object.freeze({
      digit: johari.psychic.root as Digit,
      source: "psychic_root",
      sourceType: "derived" as const,
    }),
    Object.freeze({
      digit: johari.destiny.root as Digit,
      source: "destiny_root",
      sourceType: "derived" as const,
    }),
  ];
  return fromOccurrences(
    Object.freeze([...raw.occurrences, ...augmentationEvents]),
    raw.ignoredZeros,
    Object.freeze(augmentationEvents),
  );
}

export function loShuDigits(): readonly Digit[] {
  return DIGITS;
}

export const rawGrid = loShuRawGrid;
export const augmentedGrid = loShuAugmentedGrid;
export const evaluateTriples = evaluateLoShuLines;
