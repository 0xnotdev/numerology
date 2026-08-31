import { assertSupportedLatinMapping, CHEIRO_1926_ALPHABET, mapLetters } from "./alphabets";
import { parseCivilDate, sumDigits } from "./date";
import { digitalRoot, reduceWithPolicy } from "./reduction";

export interface CheiroNameResult {
  readonly root: number;
  readonly tokenCompounds: readonly number[];
  readonly tokenRoots: readonly number[];
  readonly total: number;
  readonly values: readonly number[];
}

export interface CheiroDateMetrics {
  readonly birth: { readonly compound: number; readonly root: number };
  readonly month: { readonly compound: number; readonly root: number };
  readonly year: { readonly compound: number; readonly root: number };
}

function tokens(input: string): readonly string[] {
  return Object.freeze(input.normalize("NFC").toUpperCase().trim().split(/\s+/u).filter(Boolean));
}

export function cheiroName(name: string): CheiroNameResult {
  const mappedTokens = tokens(name).map((token) => mapLetters(token, CHEIRO_1926_ALPHABET));
  if (mappedTokens.length === 0) {
    throw new RangeError("Cheiro name calculation requires at least one token.");
  }
  for (const mapped of mappedTokens) {
    assertSupportedLatinMapping(mapped);
  }

  const tokenCompounds = mappedTokens.map((mapped) => mapped.compound);
  const tokenRoots = tokenCompounds.map((compound) => digitalRoot(compound).value);
  const total = tokenRoots.reduce((sum, root) => sum + root, 0);
  const values = mappedTokens.flatMap((mapped) => mapped.letters.map((letter) => letter.value));

  return Object.freeze({
    root: digitalRoot(total).value,
    tokenCompounds: Object.freeze(tokenCompounds),
    tokenRoots: Object.freeze(tokenRoots),
    total,
    values: Object.freeze(values),
  });
}

function simple(compound: number): { readonly compound: number; readonly root: number } {
  const reduced = reduceWithPolicy(compound, { masters: [], policyId: "cheiro_1926_v1.date" });
  return Object.freeze({ compound, root: reduced.output });
}

export function cheiroDateMetrics(date: string): CheiroDateMetrics {
  const parts = parseCivilDate(date);
  return Object.freeze({
    birth: simple(parts.day),
    month: simple(parts.month),
    year: simple(sumDigits(parts.year)),
  });
}

export function cheiroBirth(date: string): CheiroDateMetrics["birth"] {
  return cheiroDateMetrics(date).birth;
}

export function cheiroMonth(date: string): CheiroDateMetrics["month"] {
  return cheiroDateMetrics(date).month;
}

export function cheiroYear(date: string): CheiroDateMetrics["year"] {
  return cheiroDateMetrics(date).year;
}
