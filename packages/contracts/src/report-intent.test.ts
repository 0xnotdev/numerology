import { describe, expect, it } from "vitest";
import {
  normalizeReportIntentInput,
  reportIntentInputSchema,
  reportIntentSnapshotSchema,
} from "./report-intent";

const validInput = {
  consents: { noticeVersion: "privacy-v1", requiredProcessing: true },
  delivery: { email: "  Person@Example.COM " },
  locale: "en-IN",
  schemaVersion: "1.0.0",
  subject: {
    dateOfBirth: "2000-02-29",
    names: [
      { kind: "birth_full", value: " José  D’Souza " },
      { kind: "popular", value: "Jose D'Souza" },
    ],
  },
} as const;

describe("report intent contract", () => {
  it("normalizes email/date/name Unicode at the complete-input boundary", () => {
    const normalized = normalizeReportIntentInput(validInput, "2026-09-03");
    expect(normalized.delivery.email).toBe("person@example.com");
    expect(normalized.subject.names[0]?.value).toBe("José  D’Souza");
    expect(normalized.subject.dateOfBirth).toBe("2000-02-29");
    expect(normalized.consents.analytics).toBe(false);
    expect(normalized.consents.marketingEmail).toBe(false);
  });

  it("keeps optional analytics consent separate and unticked by default", () => {
    expect(
      normalizeReportIntentInput(
        { ...validInput, consents: { ...validInput.consents, analytics: true } },
        "2026-09-03",
      ).consents,
    ).toEqual({
      analytics: true,
      marketingEmail: false,
      noticeVersion: "privacy-v1",
      requiredProcessing: true,
    });
  });

  it.each([
    ["invalid leap date", "2001-02-29", "real Gregorian"],
    ["future date", "2027-02-28", "future"],
  ])("rejects %s", (_label, date, message) => {
    expect(() =>
      normalizeReportIntentInput(
        { ...validInput, subject: { ...validInput.subject, dateOfBirth: date } },
        "2026-09-03",
      ),
    ).toThrow(message);
  });

  it("rejects underage, unsafe, and unknown-field inputs", () => {
    expect(() =>
      normalizeReportIntentInput(
        { ...validInput, subject: { ...validInput.subject, dateOfBirth: "2010-09-04" } },
        "2026-09-03",
      ),
    ).toThrow("at least 18");
    expect(() =>
      normalizeReportIntentInput(
        {
          ...validInput,
          subject: {
            ...validInput.subject,
            names: [{ kind: "birth_full", value: "A\u202eB" }, validInput.subject.names[1]],
          },
        },
        "2026-09-03",
      ),
    ).toThrow("unsupported");
    expect(() => reportIntentInputSchema.parse({ ...validInput, unexpected: true })).toThrow();
  });

  it("requires an explicit versioned Latin engine spelling for non-Latin display names", () => {
    const hindi = {
      ...validInput,
      subject: {
        ...validInput.subject,
        names: [
          { kind: "birth_full", locale: "hi-IN", value: "श्रेया पटनायक" },
          { kind: "popular", locale: "hi-IN", value: "श्रेया" },
        ],
      },
    } as const;
    expect(() => normalizeReportIntentInput(hindi, "2026-09-03")).toThrow(
      "customer-confirmed Latin engine spelling",
    );

    const complete = normalizeReportIntentInput(
      {
        ...hindi,
        subject: {
          ...hindi.subject,
          names: [
            {
              kind: "birth_full",
              locale: "hi-IN",
              value: "श्रेया  पटनायक",
              engineLatin: "Shreya Patnaik",
              engineLatinConfirmed: true,
              engineLatinVersion: "1.0.0",
            },
            {
              kind: "popular",
              locale: "hi-IN",
              value: "श्रेया",
              engineLatin: "Shreya",
              engineLatinConfirmed: true,
              engineLatinVersion: "1.0.0",
            },
          ],
        },
      },
      "2026-09-03",
    );
    expect(complete.subject.names[0]?.value).toBe("श्रेया  पटनायक");
    expect(complete.subject.names[0]?.engineLatin).toBe("Shreya Patnaik");
    expect(() =>
      normalizeReportIntentInput(
        {
          ...hindi,
          subject: {
            ...hindi.subject,
            names: [
              {
                kind: "birth_full",
                value: "ଓଡ଼ିଆ",
                engineLatin: "Odia 2",
                engineLatinConfirmed: true,
                engineLatinVersion: "1.0.0",
              },
              hindi.subject.names[1],
            ],
          },
        },
        "2026-09-03",
      ),
    ).toThrow("cannot contain digits");
  });

  it("requires the immutable snapshot to carry its authoritative as-of date", () => {
    const snapshot = reportIntentSnapshotSchema.parse({
      asOfDate: "2026-09-03",
      input: normalizeReportIntentInput(validInput, "2026-09-03"),
      schemaVersion: "1.0.0",
    });
    expect(snapshot.asOfDate).toBe("2026-09-03");
    expect(() => reportIntentSnapshotSchema.parse({ ...snapshot, asOfDate: undefined })).toThrow();
    expect(() => reportIntentSnapshotSchema.parse({ ...snapshot, extra: true })).toThrow();
  });
});
