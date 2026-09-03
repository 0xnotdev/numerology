export const intakeSteps = ["name", "birth-date", "delivery", "review", "preview"] as const;

export type IntakeStep = (typeof intakeSteps)[number];
export type IntakeLocale = "en-IN" | "hi-IN" | "or-IN";

export interface IntakeProgress {
  readonly locale: IntakeLocale;
  readonly savedAt: string;
  readonly step: IntakeStep;
}

const progressKeys = ["locale", "savedAt", "step"] as const;
const progressKeySet = new Set<string>(progressKeys);
const localeSet = new Set<IntakeLocale>(["en-IN", "hi-IN", "or-IN"]);
const stepSet = new Set<IntakeStep>(intakeSteps);
const MAX_PROGRESS_AGE_MS = 24 * 60 * 60 * 1_000;
const isoTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isProgress(value: unknown): value is IntakeProgress {
  if (!isPlainRecord(value)) return false;
  const keys = Object.keys(value);
  if (keys.length !== progressKeys.length || keys.some((key) => !progressKeySet.has(key))) {
    return false;
  }
  return (
    typeof value.locale === "string" &&
    localeSet.has(value.locale as IntakeLocale) &&
    typeof value.step === "string" &&
    stepSet.has(value.step as IntakeStep) &&
    typeof value.savedAt === "string" &&
    isoTimestampPattern.test(value.savedAt) &&
    Number.isFinite(Date.parse(value.savedAt)) &&
    new Date(value.savedAt).toISOString() === value.savedAt
  );
}

/** Serializes the browser-only resume marker. Intake answers must never be passed here. */
export function encodeIntakeProgress(progress: IntakeProgress): string {
  if (!isProgress(progress)) throw new TypeError("Invalid intake progress marker.");
  return JSON.stringify(progress);
}

/** Reads a marker only when its strict shape and 24-hour retention window are valid. */
export function decodeIntakeProgress(serialized: string, now = new Date()): IntakeProgress | null {
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!isProgress(parsed)) return null;
    const savedAt = Date.parse(parsed.savedAt);
    const age = now.valueOf() - savedAt;
    if (age < -5 * 60 * 1_000 || age > MAX_PROGRESS_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}
