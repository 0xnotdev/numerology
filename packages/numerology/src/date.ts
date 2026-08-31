export interface CivilDateParts {
  readonly day: number;
  readonly iso: string;
  readonly month: number;
  readonly year: number;
}

export interface DateDigitOccurrence {
  readonly digit: number;
  readonly source: string;
}

const CIVIL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;

export function utcGregorianDate(year: number, month: number, day: number): Date {
  if (
    !Number.isInteger(year) ||
    year < 1 ||
    year > 9999 ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12 ||
    !Number.isInteger(day) ||
    day < 1
  ) {
    throw new RangeError("Date parts must be a Gregorian calendar date.");
  }

  // Date.UTC treats years 0 through 99 as 1900 through 1999. Setting the
  // full year on an epoch date avoids that legacy constructor behavior.
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new RangeError("Date parts must be a real Gregorian calendar date.");
  }
  return date;
}

export function parseCivilDate(value: string): CivilDateParts {
  const match = CIVIL_DATE.exec(value);
  if (!match) {
    throw new RangeError("Civil date must use YYYY-MM-DD format.");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) {
    throw new RangeError("Civil date must be a real Gregorian calendar date.");
  }

  try {
    utcGregorianDate(year, month, day);
  } catch {
    throw new RangeError("Civil date must be a real Gregorian calendar date.");
  }

  return Object.freeze({ day, iso: value, month, year });
}

export function digitsOfInteger(value: number): number[] {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError("digitsOfInteger expects a non-negative safe integer.");
  }
  return String(value).split("").map(Number);
}

export function sumDigits(value: number): number {
  return digitsOfInteger(value).reduce((sum, digit) => sum + digit, 0);
}

export function civilDateDigitOccurrences(value: string): DateDigitOccurrence[] {
  const date = parseCivilDate(value);
  const components = [
    ["year", String(date.year).padStart(4, "0")],
    ["month", String(date.month).padStart(2, "0")],
    ["day", String(date.day).padStart(2, "0")],
  ] as const;

  return components.flatMap(([label, digits]) =>
    Array.from(digits).map((digit, index) => ({
      digit: Number(digit),
      source: `${label}[${index}]`,
    })),
  );
}

export function yearFromAsOfDate(value: string): number {
  return parseCivilDate(value).year;
}
