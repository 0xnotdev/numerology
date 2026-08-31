import { assertSupportedLatinMapping, JOHARI_1990_ALPHABET, mapLetters } from "./alphabets";
import { civilDateDigitOccurrences, parseCivilDate, sumDigits, utcGregorianDate } from "./date";
import { digitalRoot, reduceWithPolicy } from "./reduction";

export type JohariPlanet =
  | "Jupiter"
  | "Ketu"
  | "Mars"
  | "Mercury"
  | "Moon"
  | "Rahu"
  | "Saturn"
  | "Sun"
  | "Venus";
export type JohariWeekday =
  | "Friday"
  | "Monday"
  | "Saturday"
  | "Sunday"
  | "Thursday"
  | "Tuesday"
  | "Wednesday";

export interface JohariSimpleResult {
  readonly compound: number;
  readonly root: number;
}

export interface JohariCoreResult {
  readonly destiny: JohariSimpleResult;
  readonly psychic: JohariSimpleResult;
}

export interface JohariNameResult extends JohariSimpleResult {
  readonly values: readonly number[];
}

export interface JohariProjectedYearInput {
  readonly birthDay: number;
  readonly birthMonth: number;
  readonly targetYear: number;
}

export interface JohariProjectedYearResult extends JohariSimpleResult {
  readonly weekday: JohariWeekday;
  readonly weekdayValue: number;
  readonly yearSuffix: number;
}

const PLANETS: Readonly<Record<number, JohariPlanet>> = Object.freeze({
  1: "Sun",
  2: "Moon",
  3: "Jupiter",
  4: "Rahu",
  5: "Mercury",
  6: "Venus",
  7: "Ketu",
  8: "Saturn",
  9: "Mars",
});

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
const WEEKDAY_VALUES: Readonly<Record<JohariWeekday, number>> = Object.freeze({
  Friday: 6,
  Monday: 2,
  Saturday: 8,
  Sunday: 1,
  Thursday: 3,
  Tuesday: 9,
  Wednesday: 5,
});

function simple(compound: number): JohariSimpleResult {
  const reduction = reduceWithPolicy(compound, { masters: [], policyId: "indian_johari_1990_v1" });
  return Object.freeze({ compound, root: reduction.output });
}

export function johariCore(date: string): JohariCoreResult {
  const parts = parseCivilDate(date);
  const destinyCompound = civilDateDigitOccurrences(date).reduce(
    (total, occurrence) => total + occurrence.digit,
    0,
  );
  return Object.freeze({
    destiny: simple(destinyCompound),
    psychic: simple(parts.day),
  });
}

export function psychic(date: string): JohariSimpleResult {
  return johariCore(date).psychic;
}

export function destiny(date: string): JohariSimpleResult {
  return johariCore(date).destiny;
}

export function johariNameNumber(name: string): JohariNameResult {
  const mapped = mapLetters(name, JOHARI_1990_ALPHABET);
  assertSupportedLatinMapping(mapped);
  return Object.freeze({
    compound: mapped.compound,
    root: digitalRoot(mapped.compound).value,
    values: Object.freeze(mapped.letters.map((letter) => letter.value)),
  });
}

export const nameNumber = johariNameNumber;

export function planetForRoot(root: number): JohariPlanet {
  const planet = PLANETS[root];
  if (planet === undefined) {
    throw new RangeError("Johari planet lookup expects a root from 1 through 9.");
  }
  return planet;
}

export function johariProjectedYear(input: JohariProjectedYearInput): JohariProjectedYearResult {
  if (input.targetYear < 1 || input.targetYear > 9999 || !Number.isInteger(input.targetYear)) {
    throw new RangeError("Projected Year target must be a Gregorian year.");
  }
  let date: Date;
  try {
    date = utcGregorianDate(input.targetYear, input.birthMonth, input.birthDay);
  } catch {
    throw new RangeError("Projected Year birthday must exist in the target year.");
  }

  const weekday = WEEKDAYS[date.getUTCDay()];
  if (weekday === undefined) {
    throw new RangeError("Projected Year weekday could not be determined.");
  }
  const weekdayValue = WEEKDAY_VALUES[weekday];
  const yearSuffix = input.targetYear % 100;
  const compound = input.birthMonth + input.birthDay + yearSuffix + weekdayValue;
  return Object.freeze({
    compound,
    root: digitalRoot(compound).value,
    weekday,
    weekdayValue,
    yearSuffix,
  });
}

export function johariYearDigitSum(year: number): number {
  return sumDigits(year);
}
