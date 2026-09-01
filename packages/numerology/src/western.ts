import { assertSupportedLatinMapping, mapLetters, WESTERN_ALPHABET } from "./alphabets";
import { digitsOfInteger, parseCivilDate, sumDigits } from "./date";
import { tokenizeNameUnits, type NameToken } from "./identity";
import { reduceWithPolicy, type PolicyReductionTrace } from "./reduction";
import type { LetterClassification, MasterNumber } from "./types";

const WESTERN_CORE_MASTERS = [11, 22, 33] as const;
const NO_MASTERS = [] as const;
const KARMIC_DEBTS = [13, 14, 16, 19] as const;
const VOWELS = new Set(["A", "E", "I", "O", "U"]);

type NameSubset = "all" | "consonants" | "vowels";

export interface DateReductionResult {
  readonly componentOutputs: readonly number[];
  readonly componentReductions: readonly PolicyReductionTrace[];
  readonly compound: number;
  readonly finalReduction: PolicyReductionTrace;
  readonly karmicDebts: readonly number[];
  readonly preservedMaster: MasterNumber | null;
  readonly root: number;
}

export interface SimpleNumberResult {
  readonly compound: number;
  readonly finalReduction: PolicyReductionTrace;
  readonly karmicDebts: readonly number[];
  readonly preservedMaster: MasterNumber | null;
  readonly root: number;
}

export interface WesternNameMetricResult extends SimpleNumberResult {
  readonly tokenCompounds: readonly number[];
  readonly tokenOutputs: readonly number[];
  readonly tokenReductions: readonly PolicyReductionTrace[];
  readonly total: number;
}

export interface WesternPersonalYearResult extends SimpleNumberResult {
  readonly sunNumber: number;
  readonly targetYear: number;
  readonly yearDigitSum: number;
}

export interface WesternPersonalMonthResult extends SimpleNumberResult {
  readonly month: number;
  readonly personalYearRoot: number;
}

function freezeSimple(result: SimpleNumberResult): SimpleNumberResult {
  return Object.freeze({
    ...result,
    karmicDebts: Object.freeze([...result.karmicDebts]),
  });
}

function debtsFromReductions(reductions: readonly Pick<PolicyReductionTrace, "steps">[]): number[] {
  const debts = new Set<number>();
  for (const reduction of reductions) {
    for (const step of reduction.steps) {
      if (KARMIC_DEBTS.includes(step as (typeof KARMIC_DEBTS)[number])) {
        debts.add(step);
      }
    }
  }
  return [...debts].sort((left, right) => left - right);
}

function reduceNumber(
  compound: number,
  masters: readonly MasterNumber[],
  policyId: string,
): SimpleNumberResult {
  const finalReduction = reduceWithPolicy(compound, { masters, policyId });
  return freezeSimple({
    compound,
    finalReduction,
    karmicDebts: debtsFromReductions([finalReduction]),
    preservedMaster: finalReduction.preservedMaster,
    root: finalReduction.output,
  });
}

function dateComponentReductions(
  date: string,
  masters: readonly MasterNumber[],
  policyId: string,
): readonly PolicyReductionTrace[] {
  const parts = parseCivilDate(date);
  return Object.freeze([
    reduceWithPolicy(parts.month, { masters, policyId }),
    reduceWithPolicy(parts.day, { masters, policyId }),
    reduceWithPolicy(parts.year, { masters, policyId }),
  ]);
}

export function westernLifePath(date: string): DateReductionResult {
  const componentReductions = dateComponentReductions(
    date,
    WESTERN_CORE_MASTERS,
    "western_decoz_v1.life_path.component",
  );
  const componentOutputs = Object.freeze(componentReductions.map((component) => component.output));
  const compound = componentOutputs.reduce((sum, value) => sum + value, 0);
  const finalReduction = reduceWithPolicy(compound, {
    masters: WESTERN_CORE_MASTERS,
    policyId: "western_decoz_v1.life_path.final",
  });

  return Object.freeze({
    componentOutputs,
    componentReductions,
    compound,
    finalReduction,
    karmicDebts: Object.freeze(debtsFromReductions([finalReduction])),
    preservedMaster: finalReduction.preservedMaster,
    root: finalReduction.output,
  });
}

export function westernDigitSumLifePath(date: string): SimpleNumberResult {
  const compound = digitsOfInteger(Number(parseCivilDate(date).iso.replaceAll("-", ""))).reduce(
    (sum, value) => sum + value,
    0,
  );
  return reduceNumber(compound, WESTERN_CORE_MASTERS, "western_digit_sum_v1.life_path");
}

function classifyWesternLetter(
  character: string,
  index: number,
  yClassifications: Readonly<Record<string, LetterClassification>>,
): LetterClassification {
  if (VOWELS.has(character)) {
    return "vowel";
  }
  if (character === "Y") {
    const classification = yClassifications[String(index)];
    if (classification === undefined) {
      throw new RangeError(`Y classification required at index ${index}.`);
    }
    return classification;
  }
  return "consonant";
}

function filteredTokenValue(
  token: string,
  subset: NameSubset,
  indexOffset: number,
  yClassifications: Readonly<Record<string, LetterClassification>>,
): number {
  const mapped = mapLetters(token, WESTERN_ALPHABET);
  assertSupportedLatinMapping(mapped);
  if (subset === "all") {
    return mapped.compound;
  }

  let total = 0;
  for (const letter of mapped.letters) {
    const classification = classifyWesternLetter(
      letter.character,
      indexOffset + letter.index,
      yClassifications,
    );
    if (subset === "vowels" && classification === "vowel") {
      total += letter.value;
    }
    if (subset === "consonants" && classification === "consonant") {
      total += letter.value;
    }
  }
  return total;
}

function tokenStarts(input: string): readonly { readonly start: number; readonly token: string }[] {
  return Object.freeze(
    tokenizeNameUnits(input).map(({ start, text }: NameToken) =>
      Object.freeze({ start, token: text.toUpperCase() }),
    ),
  );
}

function westernNameMetric(
  name: string,
  subset: NameSubset,
  masters: readonly MasterNumber[] = WESTERN_CORE_MASTERS,
  yClassifications: Readonly<Record<string, LetterClassification>> = {},
): WesternNameMetricResult {
  const tokens = tokenStarts(name);
  if (tokens.length === 0) {
    throw new RangeError("Name calculation requires at least one token.");
  }

  const tokenCompounds = tokens.map(({ start, token }) =>
    filteredTokenValue(token, subset, start, yClassifications),
  );
  if (tokenCompounds.every((value) => value === 0)) {
    throw new RangeError("The requested name metric has no applicable letters.");
  }

  const tokenReductions = tokenCompounds.map((compound) =>
    reduceWithPolicy(compound, { masters, policyId: "western_decoz_v1.name.token" }),
  );
  const tokenOutputs = tokenReductions.map((reduction) => reduction.output);
  const total = tokenOutputs.reduce((sum, value) => sum + value, 0);
  const finalReduction = reduceWithPolicy(total, {
    masters,
    policyId: "western_decoz_v1.name.final",
  });

  return Object.freeze({
    compound: total,
    finalReduction,
    karmicDebts: Object.freeze(debtsFromReductions([...tokenReductions, finalReduction])),
    preservedMaster: finalReduction.preservedMaster,
    root: finalReduction.output,
    tokenCompounds: Object.freeze(tokenCompounds),
    tokenOutputs: Object.freeze(tokenOutputs),
    tokenReductions: Object.freeze(tokenReductions),
    total,
  });
}

export function westernExpression(
  name: string,
  yClassifications: Readonly<Record<string, LetterClassification>> = {},
): WesternNameMetricResult {
  return westernNameMetric(name, "all", WESTERN_CORE_MASTERS, yClassifications);
}

export function westernSoulUrge(
  name: string,
  yClassifications: Readonly<Record<string, LetterClassification>> = {},
): WesternNameMetricResult {
  return westernNameMetric(name, "vowels", WESTERN_CORE_MASTERS, yClassifications);
}

export function westernPersonality(
  name: string,
  yClassifications: Readonly<Record<string, LetterClassification>> = {},
): WesternNameMetricResult {
  return westernNameMetric(name, "consonants", WESTERN_CORE_MASTERS, yClassifications);
}

export function westernBirthday(date: string): SimpleNumberResult {
  return reduceNumber(parseCivilDate(date).day, WESTERN_CORE_MASTERS, "western_decoz_v1.birthday");
}

export function westernMaturity(
  lifePath: Pick<SimpleNumberResult, "root">,
  expression: Pick<SimpleNumberResult, "root">,
): SimpleNumberResult {
  return reduceNumber(
    lifePath.root + expression.root,
    WESTERN_CORE_MASTERS,
    "western_decoz_v1.maturity",
  );
}

export function westernAttitude(date: string): SimpleNumberResult {
  const parts = parseCivilDate(date);
  return reduceNumber(parts.month + parts.day, WESTERN_CORE_MASTERS, "western_decoz_v1.attitude");
}

export function westernKarmicLessons(name: string): readonly number[] {
  const mapped = mapLetters(name, WESTERN_ALPHABET);
  assertSupportedLatinMapping(mapped);
  const present = new Set(mapped.letters.map((letter) => letter.value));
  return Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9].filter((value) => !present.has(value)));
}

export function westernHiddenPassion(name: string): readonly number[] {
  const mapped = mapLetters(name, WESTERN_ALPHABET);
  assertSupportedLatinMapping(mapped);
  const counts = new Map<number, number>();
  for (const letter of mapped.letters) {
    counts.set(letter.value, (counts.get(letter.value) ?? 0) + 1);
  }
  const maximum = Math.max(...counts.values());
  return Object.freeze(
    [...counts.entries()]
      .filter(([, count]) => count === maximum)
      .map(([value]) => value)
      .sort((a, b) => a - b),
  );
}

export function westernBridges(
  lifePath: Pick<SimpleNumberResult, "root">,
  expression: Pick<SimpleNumberResult, "root">,
  soulUrge: Pick<SimpleNumberResult, "root">,
  personality: Pick<SimpleNumberResult, "root">,
): { readonly lifePathExpression: number; readonly soulPersonality: number } {
  return Object.freeze({
    lifePathExpression: Math.abs(lifePath.root - expression.root),
    soulPersonality: Math.abs(soulUrge.root - personality.root),
  });
}

export function westernPersonalYear(date: string, targetYear: number): WesternPersonalYearResult {
  if (!Number.isInteger(targetYear) || targetYear < 1 || targetYear > 9999) {
    throw new RangeError("Personal Year target must be a Gregorian year.");
  }
  const parts = parseCivilDate(date);
  const sunNumber = digitalRootFromNumber(parts.month + parts.day);
  const yearDigitSum = sumDigits(targetYear);
  const compound = sunNumber + yearDigitSum;
  const reduced = reduceNumber(compound, NO_MASTERS, "western_decoz_v1.personal_year");
  return Object.freeze({ ...reduced, sunNumber, targetYear, yearDigitSum });
}

export function westernPersonalMonths(
  date: string,
  targetYear: number,
): readonly WesternPersonalMonthResult[] {
  const year = westernPersonalYear(date, targetYear);
  return Object.freeze(
    Array.from({ length: 12 }, (_, index) => {
      const month = index + 1;
      const reduced = reduceNumber(
        year.root + month,
        NO_MASTERS,
        "western_decoz_v1.personal_month",
      );
      return Object.freeze({ ...reduced, month, personalYearRoot: year.root });
    }),
  );
}

export function balliettBirthDate(date: string): DateReductionResult {
  const componentReductions = dateComponentReductions(
    date,
    NO_MASTERS,
    "western_balliett_1908_v1.birth_date.component",
  );
  const componentOutputs = Object.freeze(componentReductions.map((component) => component.output));
  const compound = componentOutputs.reduce((sum, value) => sum + value, 0);
  const finalReduction = reduceWithPolicy(compound, {
    masters: NO_MASTERS,
    policyId: "western_balliett_1908_v1.birth_date.final",
  });

  return Object.freeze({
    componentOutputs,
    componentReductions,
    compound,
    finalReduction,
    karmicDebts: Object.freeze([]),
    preservedMaster: null,
    root: finalReduction.output,
  });
}

export function balliettName(name: string): WesternNameMetricResult {
  return westernNameMetric(name, "all", NO_MASTERS, {});
}

function digitalRootFromNumber(value: number): number {
  let current = value;
  while (current >= 10) {
    current = sumDigits(current);
  }
  return current;
}

export const lifePath = westernLifePath;
export const birthday = westernBirthday;
export const expression = westernExpression;
export const soulUrge = westernSoulUrge;
export const personality = westernPersonality;
export const maturity = westernMaturity;
export const attitude = westernAttitude;
export const karmicLessons = westernKarmicLessons;
export const hiddenPassion = westernHiddenPassion;
export const personalYear = westernPersonalYear;
export const personalMonths = westernPersonalMonths;

export function hasAmbiguousWesternY(
  name: string,
  yClassifications: Readonly<Record<string, LetterClassification>> = {},
): readonly number[] {
  const normalized = name.normalize("NFC").toUpperCase();
  const missing: number[] = [];
  for (const [index, character] of Array.from(normalized).entries()) {
    if (character === "Y" && yClassifications[String(index)] === undefined) {
      missing.push(index);
    }
  }
  return Object.freeze(missing);
}
