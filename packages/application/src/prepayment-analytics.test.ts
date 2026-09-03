import { describe, expect, it, vi } from "vitest";
import {
  createPrepaymentAnalyticsRecorder,
  type PrepaymentAnalyticsEventRecord,
  parsePrepaymentAnalyticsInput,
} from "./prepayment-analytics";

const SESSION_ID = "00000000-0000-4000-8000-000000000077";

describe("pre-payment analytics allowlist", () => {
  it("accepts only bounded funnel metadata and rejects answer/PII-shaped properties", () => {
    expect(
      parsePrepaymentAnalyticsInput({
        eventName: "intake_step_completed",
        properties: {
          elapsedBucket: "30_to_119_seconds",
          locale: "en-IN",
          step: "name",
        },
        schemaVersion: "1.0.0",
        sessionId: SESSION_ID,
      }),
    ).toEqual({
      eventName: "intake_step_completed",
      properties: {
        elapsedBucket: "30_to_119_seconds",
        locale: "en-IN",
        step: "name",
      },
      schemaVersion: "1.0.0",
      sessionId: SESSION_ID,
    });

    for (const forbidden of [
      { answer: "Thomas Cruise" },
      { dateOfBirth: "1990-08-12" },
      { email: "person@example.com" },
      { name: "Thomas Cruise" },
      { value: "private answer" },
    ]) {
      expect(() =>
        parsePrepaymentAnalyticsInput({
          eventName: "intake_step_completed",
          properties: {
            elapsedBucket: "30_to_119_seconds",
            locale: "en-IN",
            step: "name",
            ...forbidden,
          },
          schemaVersion: "1.0.0",
          sessionId: SESSION_ID,
        }),
      ).toThrow();
    }
  });

  it("records consented events with server-owned time/ID and 90-day expiry", async () => {
    const appended: PrepaymentAnalyticsEventRecord[] = [];
    const recorder = createPrepaymentAnalyticsRecorder({
      clock: { now: () => new Date("2026-09-03T10:00:00.000Z") },
      ids: { next: () => "00000000-0000-4000-8000-000000000078" },
      repository: { append: async (event) => void appended.push(event) },
    });

    await expect(
      recorder.record(
        {
          eventName: "preview_viewed",
          properties: { locale: "hi-IN", previewVersion: "1.0.0" },
          schemaVersion: "1.0.0",
          sessionId: SESSION_ID,
        },
        "granted",
      ),
    ).resolves.toBe("recorded");
    expect(appended).toEqual([
      {
        eventName: "preview_viewed",
        expiresAt: new Date("2026-12-02T10:00:00.000Z"),
        id: "00000000-0000-4000-8000-000000000078",
        occurredAt: new Date("2026-09-03T10:00:00.000Z"),
        properties: { locale: "hi-IN", previewVersion: "1.0.0" },
        schemaVersion: "1.0.0",
        sessionId: SESSION_ID,
      },
    ]);
  });

  it("does not persist optional funnel events without affirmative consent", async () => {
    const append = vi.fn();
    const recorder = createPrepaymentAnalyticsRecorder({
      clock: { now: () => new Date("2026-09-03T10:00:00.000Z") },
      ids: { next: () => "00000000-0000-4000-8000-000000000078" },
      repository: { append },
    });

    await expect(
      recorder.record(
        {
          eventName: "intake_started",
          properties: { locale: "or-IN" },
          schemaVersion: "1.0.0",
          sessionId: SESSION_ID,
        },
        "declined",
      ),
    ).resolves.toBe("skipped_no_consent");
    expect(append).not.toHaveBeenCalled();
  });
});
