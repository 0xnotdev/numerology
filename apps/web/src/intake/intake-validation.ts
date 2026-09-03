export type BirthDateErrorCode = "invalid" | "underage";

const civilDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/u;
const latinNamePattern = /^[\p{Script=Latin}\p{Mark}\p{Number}\s'’ʼ.-]+$/u;

function parseCivilDate(value: string): { year: number; month: number; day: number } | null {
  const match = civilDatePattern.exec(value);
  if (match === null) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
    ? { day, month, year }
    : null;
}

function compareCivilDates(
  left: { year: number; month: number; day: number },
  right: { year: number; month: number; day: number },
): number {
  return left.year - right.year || left.month - right.month || left.day - right.day;
}

/** UI-only boundary check. The application contract remains authoritative on submission. */
export function validateAdultBirthDate(
  dateOfBirth: string,
  asOfDate: string,
): BirthDateErrorCode | null {
  const birth = parseCivilDate(dateOfBirth);
  const asOf = parseCivilDate(asOfDate);
  if (birth === null || asOf === null || compareCivilDates(birth, asOf) > 0) return "invalid";
  let age = asOf.year - birth.year;
  if (asOf.month < birth.month || (asOf.month === birth.month && asOf.day < birth.day)) age -= 1;
  return age < 18 ? "underage" : null;
}

export function needsLatinSpelling(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length > 0 && !latinNamePattern.test(trimmed);
}

/**
 * Return code-point indexes for every Y used by the calculation engine.
 *
 * Non-Latin names are calculated from the separately confirmed Latin spelling;
 * until that spelling exists there are no Y occurrences to classify. Keeping
 * the indexes aligned with Array.from is important because the engine stores
 * yClassifications by string index.
 */
export function yOccurrences(name: string, engineLatin?: string): readonly number[] {
  const calculationName = needsLatinSpelling(name) ? (engineLatin ?? "") : name;
  return Array.from(calculationName).flatMap((character, index) =>
    /y/iu.test(character) ? [index] : [],
  );
}

/** Y is occurrence-level and must be confirmed by the customer when present. */
export function hasContextualY(name: string, engineLatin?: string): boolean {
  return yOccurrences(name, engineLatin).length > 0;
}

export function currentCivilDate(now: Date): string {
  if (!Number.isFinite(now.valueOf())) throw new RangeError("Invalid current date.");
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Kolkata",
    year: "numeric",
  }).formatToParts(now);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  const year = values.get("year");
  const month = values.get("month");
  const day = values.get("day");
  if (year === undefined || month === undefined || day === undefined) {
    throw new RangeError("Unable to determine current civil date.");
  }
  return `${year}-${month}-${day}`;
}
