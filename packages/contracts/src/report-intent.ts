import { z } from "zod";

export const REPORT_INTENT_SCHEMA_VERSION = "1.0.0" as const;
export const REPORT_INTENT_SNAPSHOT_SCHEMA_VERSION = "1.0.0" as const;

const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "Expected a YYYY-MM-DD date.");

export const reportIntentNameSchema = z.strictObject({
  engineLatin: z.string().trim().min(1).max(120).optional(),
  engineLatinConfirmed: z.literal(true).optional(),
  engineLatinVersion: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/u)
    .optional(),
  kind: z.enum(["birth_full", "current_full", "popular", "report_display"]),
  locale: z.string().max(20).optional(),
  value: z.string().trim().min(1).max(120),
});

export const reportIntentInputSchema = z.strictObject({
  billing: z
    .strictObject({
      addressLine1: z.string().trim().max(160),
      addressLine2: z.string().trim().max(160).optional(),
      city: z.string().trim().max(80),
      gstin: z
        .string()
        .regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/u)
        .optional(),
      legalBusinessName: z.string().trim().max(160).optional(),
      postalCode: z.string().regex(/^\d{6}$/u),
      recipientName: z.string().trim().min(1).max(120),
      stateCode: z.string().length(2),
    })
    .optional(),
  consents: z.strictObject({
    analytics: z.boolean().default(false),
    marketingEmail: z.boolean().default(false),
    noticeVersion: z.string().min(1),
    requiredProcessing: z.literal(true),
  }),
  delivery: z.strictObject({ email: z.string().trim().pipe(z.email().max(254)) }),
  locale: z.enum(["en-IN", "hi-IN", "or-IN"]),
  schemaVersion: z.literal(REPORT_INTENT_SCHEMA_VERSION),
  subject: z.strictObject({
    dateOfBirth: localDate,
    names: z.array(reportIntentNameSchema).min(2).max(5),
    yClassifications: z.record(z.string(), z.enum(["vowel", "consonant"])).default({}),
  }),
});

const draftSubjectSchema = z.strictObject({
  dateOfBirth: localDate.optional(),
  names: z.array(reportIntentNameSchema).min(1).max(5).optional(),
  yClassifications: z.record(z.string(), z.enum(["vowel", "consonant"])).optional(),
});

export const reportIntentDraftSchema = z.strictObject({
  billing: reportIntentInputSchema.shape.billing,
  consents: reportIntentInputSchema.shape.consents.optional(),
  delivery: reportIntentInputSchema.shape.delivery.optional(),
  locale: reportIntentInputSchema.shape.locale,
  schemaVersion: z.literal(REPORT_INTENT_SCHEMA_VERSION),
  subject: draftSubjectSchema.optional(),
});

export const reportIntentPatchSchema = z.strictObject({
  billing: reportIntentInputSchema.shape.billing,
  consents: reportIntentInputSchema.shape.consents.optional(),
  delivery: reportIntentInputSchema.shape.delivery.optional(),
  locale: reportIntentInputSchema.shape.locale.optional(),
  subject: draftSubjectSchema.optional(),
});

/** Immutable completion context used to keep previews stable across calendar rollovers. */
export const reportIntentSnapshotSchema = z.strictObject({
  asOfDate: localDate,
  input: reportIntentInputSchema,
  schemaVersion: z.literal(REPORT_INTENT_SNAPSHOT_SCHEMA_VERSION),
});

export type ReportIntentInput = z.output<typeof reportIntentInputSchema>;
export type ReportIntentName = z.output<typeof reportIntentNameSchema>;
export type ReportIntentSnapshot = z.output<typeof reportIntentSnapshotSchema>;

const unsafeNameText = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Extended_Pictographic}<>]/u;
const nameDigit = /\p{Number}/u;
const latinDisplayText = /^[\p{Script=Latin}\p{Mark}\s'’ʼ.-]+$/u;

function parseDate(value: string, label: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (match === null) {
    throw new RangeError(`${label} must be a real Gregorian date.`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    throw new RangeError(`${label} must be a real Gregorian date.`);
  }
  return { day, month, year };
}

function compareDate(
  left: { year: number; month: number; day: number },
  right: typeof left,
): number {
  return left.year - right.year || left.month - right.month || left.day - right.day;
}

function assertSafeName(name: ReportIntentName): void {
  const value = name.value.normalize("NFC");
  if (value.trim().length === 0 || Array.from(value).length > 120) {
    throw new RangeError(`Name ${name.kind} must contain 1–120 Unicode characters.`);
  }
  if (unsafeNameText.test(value)) {
    throw new RangeError(
      `Name ${name.kind} contains unsupported control, markup, or emoji characters.`,
    );
  }
  if (nameDigit.test(value)) {
    throw new RangeError(`Name ${name.kind} cannot contain digits.`);
  }

  const engineLatin = name.engineLatin?.normalize("NFC").trim();
  const displayIsLatin = latinDisplayText.test(value);
  if (!displayIsLatin) {
    if (
      engineLatin === undefined ||
      name.engineLatinConfirmed !== true ||
      name.engineLatinVersion === undefined
    ) {
      throw new RangeError(
        `Name ${name.kind} requires a customer-confirmed Latin engine spelling with a version.`,
      );
    }
    if (nameDigit.test(engineLatin)) {
      throw new RangeError(`Name ${name.kind} Latin engine spelling cannot contain digits.`);
    }
    if (!latinDisplayText.test(engineLatin)) {
      throw new RangeError(`Name ${name.kind} Latin engine spelling must use Latin letters.`);
    }
    if (unsafeNameText.test(engineLatin)) {
      throw new RangeError(`Name ${name.kind} Latin engine spelling contains unsafe characters.`);
    }
  } else if (engineLatin !== undefined) {
    if (name.engineLatinConfirmed !== true || name.engineLatinVersion === undefined) {
      throw new RangeError(
        `Name ${name.kind} Latin engine spelling requires confirmation and a version.`,
      );
    }
    if (nameDigit.test(engineLatin)) {
      throw new RangeError(`Name ${name.kind} Latin engine spelling cannot contain digits.`);
    }
    if (!latinDisplayText.test(engineLatin)) {
      throw new RangeError(`Name ${name.kind} Latin engine spelling must use Latin letters.`);
    }
    if (unsafeNameText.test(engineLatin)) {
      throw new RangeError(`Name ${name.kind} Latin engine spelling contains unsafe characters.`);
    }
  }
}

/** Validates and normalizes complete intake without transliterating a customer name. */
export function normalizeReportIntentInput(input: unknown, asOfDate: string): ReportIntentInput {
  const parsed = reportIntentInputSchema.parse(input);
  const birth = parseDate(parsed.subject.dateOfBirth, "dateOfBirth");
  const asOf = parseDate(asOfDate, "asOfDate");
  if (compareDate(birth, asOf) > 0) {
    throw new RangeError("dateOfBirth cannot be in the future.");
  }
  let age = asOf.year - birth.year;
  if (asOf.month < birth.month || (asOf.month === birth.month && asOf.day < birth.day)) {
    age -= 1;
  }
  if (age < 18) {
    throw new RangeError("The subject must be at least 18 years old.");
  }
  const names = parsed.subject.names.map((name) => {
    assertSafeName(name);
    return {
      ...name,
      ...(name.engineLatin === undefined
        ? {}
        : { engineLatin: name.engineLatin.normalize("NFC").trim().replace(/\s+/gu, " ") }),
      value: name.value.normalize("NFC").trim(),
    };
  });
  const normalized = {
    ...parsed,
    delivery: { email: parsed.delivery.email.trim().toLowerCase() },
    subject: {
      ...parsed.subject,
      names,
    },
  };
  return reportIntentInputSchema.parse(normalized);
}
