import { deepFreeze } from "@numerology/shared";
import { z } from "zod";
import type { Clock } from "./clock";
import type { IdGenerator } from "./id-generator";

export const PREPAYMENT_ANALYTICS_SCHEMA_VERSION = "1.0.0" as const;
export const PREPAYMENT_ANALYTICS_EVENT_NAMES = [
  "landing_viewed",
  "intake_started",
  "intake_step_completed",
  "intake_reviewed",
  "preview_viewed",
] as const;

const locale = z.enum(["en-IN", "hi-IN", "or-IN"]);
const uuid = z.uuid();
const semver = z.string().regex(/^\d+\.\d+\.\d+$/u);
const elapsedBucket = z.enum([
  "under_30_seconds",
  "30_to_119_seconds",
  "2_to_4_minutes",
  "over_4_minutes",
]);
const experimentId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/u);
const base = {
  schemaVersion: z.literal(PREPAYMENT_ANALYTICS_SCHEMA_VERSION),
  sessionId: uuid,
} as const;

export const prepaymentAnalyticsInputSchema = z.discriminatedUnion("eventName", [
  z.strictObject({
    ...base,
    eventName: z.literal("landing_viewed"),
    properties: z.strictObject({
      campaign: z
        .enum(["direct", "organic_search", "owned_email", "approved_partner", "paid_search"])
        .optional(),
      deviceClass: z.enum(["mobile", "tablet", "desktop"]),
      locale,
      pageVersion: semver,
    }),
  }),
  z.strictObject({
    ...base,
    eventName: z.literal("intake_started"),
    properties: z.strictObject({ experimentId: experimentId.optional(), locale }),
  }),
  z.strictObject({
    ...base,
    eventName: z.literal("intake_step_completed"),
    properties: z.strictObject({
      elapsedBucket,
      locale,
      step: z.enum(["name", "date", "email", "consent", "review"]),
    }),
  }),
  z.strictObject({
    ...base,
    eventName: z.literal("intake_reviewed"),
    properties: z.strictObject({ elapsedBucket, locale }),
  }),
  z.strictObject({
    ...base,
    eventName: z.literal("preview_viewed"),
    properties: z.strictObject({ locale, previewVersion: semver }),
  }),
]);

export type PrepaymentAnalyticsInput = Readonly<z.output<typeof prepaymentAnalyticsInputSchema>>;

export type PrepaymentAnalyticsEventRecord = PrepaymentAnalyticsInput & {
  readonly expiresAt: Date;
  readonly id: string;
  readonly occurredAt: Date;
};

export interface PrepaymentAnalyticsRepository {
  append(event: PrepaymentAnalyticsEventRecord): Promise<void>;
}

export interface PrepaymentAnalyticsDependencies {
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly repository: PrepaymentAnalyticsRepository;
}

export type OptionalAnalyticsConsent = "declined" | "granted";
export type PrepaymentAnalyticsRecordResult = "recorded" | "skipped_no_consent";

const RAW_EVENT_RETENTION_MS = 90 * 24 * 60 * 60 * 1_000;

export function parsePrepaymentAnalyticsInput(input: unknown): PrepaymentAnalyticsInput {
  return deepFreeze(prepaymentAnalyticsInputSchema.parse(input));
}

/** Records only the frozen allowlist. Answers and arbitrary properties cannot cross this boundary. */
export function createPrepaymentAnalyticsRecorder(dependencies: PrepaymentAnalyticsDependencies) {
  return {
    async record(
      input: unknown,
      consent: OptionalAnalyticsConsent,
    ): Promise<PrepaymentAnalyticsRecordResult> {
      const parsed = parsePrepaymentAnalyticsInput(input);
      if (consent !== "granted") return "skipped_no_consent";
      const occurredAt = dependencies.clock.now();
      if (!Number.isFinite(occurredAt.valueOf())) {
        throw new RangeError("ANALYTICS_CLOCK_INVALID");
      }
      const id = dependencies.ids.next();
      if (!uuid.safeParse(id).success) throw new RangeError("ANALYTICS_ID_INVALID");
      const event = deepFreeze({
        ...parsed,
        expiresAt: new Date(occurredAt.valueOf() + RAW_EVENT_RETENTION_MS),
        id,
        occurredAt: new Date(occurredAt.valueOf()),
      });
      await dependencies.repository.append(event);
      return "recorded";
    },
  };
}
