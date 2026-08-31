import { digitalRoot } from "./reduction";

export interface Alphabet {
  readonly id: string;
  readonly values: Readonly<Record<string, number>>;
}

export interface MappedLetter {
  readonly character: string;
  readonly index: number;
  readonly value: number;
}

export interface UnsupportedLetter {
  readonly character: string;
  readonly index: number;
}

export interface LetterMappingResult {
  readonly alphabetId: string;
  readonly compound: number;
  readonly letters: readonly MappedLetter[];
  readonly root: number;
  readonly unsupported: readonly UnsupportedLetter[];
}

const DOCUMENTED_SEPARATORS = new Set([" ", "\t", "\n", "\r", "-", "'", "’", "ʼ", "."]);

function makeAlphabet(id: string, groups: Readonly<Record<number, string>>): Alphabet {
  const values: Record<string, number> = {};
  for (const [value, letters] of Object.entries(groups)) {
    for (const letter of letters) {
      const character = letter.toUpperCase();
      if (values[character] !== undefined) {
        throw new Error(`Alphabet ${id} assigns ${character} more than once.`);
      }
      values[character] = Number(value);
    }
  }

  return Object.freeze({ id, values: Object.freeze(values) });
}

export const WESTERN_ALPHABET = makeAlphabet("western_sequential_1_9_v1", {
  1: "AJS",
  2: "BKT",
  3: "CLU",
  4: "DMV",
  5: "ENW",
  6: "FOX",
  7: "GPY",
  8: "HQZ",
  9: "IR",
});

export const CHEIRO_1926_ALPHABET = makeAlphabet("cheiro_1926_latin_v1", {
  1: "AIJQY",
  2: "BKR",
  3: "CGLS",
  4: "DMT",
  5: "EHNX",
  6: "UVW",
  7: "OZ",
  8: "FP",
  9: "",
});

export const JOHARI_1990_ALPHABET = makeAlphabet("johari_unit_system_v1", {
  1: "AIJQY",
  2: "BCKR",
  3: "GLS",
  4: "DMT",
  5: "NE",
  6: "UVWX",
  7: "OZ",
  8: "FHP",
  9: "",
});

function isAsciiLetter(character: string): boolean {
  return /^[A-Z]$/u.test(character);
}

export function mapLetters(input: string, alphabet: Alphabet): LetterMappingResult {
  const letters: MappedLetter[] = [];
  const unsupported: UnsupportedLetter[] = [];
  const normalized = input.normalize("NFC").toUpperCase();

  for (const [index, character] of Array.from(normalized).entries()) {
    if (DOCUMENTED_SEPARATORS.has(character)) {
      continue;
    }

    const value = alphabet.values[character];
    if (value !== undefined) {
      letters.push(Object.freeze({ character, index, value }));
      continue;
    }

    unsupported.push(Object.freeze({ character, index }));
  }

  const compound = letters.reduce((sum, letter) => sum + letter.value, 0);
  return Object.freeze({
    alphabetId: alphabet.id,
    compound,
    letters: Object.freeze(letters),
    root: digitalRoot(compound).value,
    unsupported: Object.freeze(
      unsupported.filter(
        (letter) =>
          !isAsciiLetter(letter.character) || alphabet.values[letter.character] === undefined,
      ),
    ),
  });
}

export function mapWestern(input: string): LetterMappingResult {
  return mapLetters(input, WESTERN_ALPHABET);
}

export function mapCheiro1926(input: string): LetterMappingResult {
  return mapLetters(input, CHEIRO_1926_ALPHABET);
}

export function mapJohari1990(input: string): LetterMappingResult {
  return mapLetters(input, JOHARI_1990_ALPHABET);
}

export function assertSupportedLatinMapping(result: LetterMappingResult): void {
  if (result.unsupported.length > 0) {
    throw new RangeError("Name contains letters unsupported by the selected alphabet.");
  }
  if (result.letters.length === 0) {
    throw new RangeError("Name calculation requires at least one supported Latin letter.");
  }
}
