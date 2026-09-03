import { describe, expect, it } from "vitest";
import { decodeIntakeProgress, encodeIntakeProgress, type IntakeProgress } from "./intake-progress";

const valid: IntakeProgress = {
  locale: "en-IN",
  savedAt: "2026-09-03T10:00:00.000Z",
  step: "delivery",
};

describe("intake browser progress", () => {
  it("serializes only the non-sensitive resume marker", () => {
    const encoded = encodeIntakeProgress(valid);

    expect(JSON.parse(encoded)).toEqual(valid);
    expect(encoded).not.toContain("name");
    expect(encoded).not.toContain("dateOfBirth");
    expect(encoded).not.toContain("email");
  });

  it("accepts a valid marker and rejects unknown or private fields", () => {
    expect(
      decodeIntakeProgress(JSON.stringify(valid), new Date("2026-09-03T11:00:00.000Z")),
    ).toEqual(valid);
    expect(
      decodeIntakeProgress(
        JSON.stringify({ ...valid, email: "person@example.com" }),
        new Date("2026-09-03T11:00:00.000Z"),
      ),
    ).toBeNull();
    expect(
      decodeIntakeProgress(
        JSON.stringify({ ...valid, dateOfBirth: "1990-01-01" }),
        new Date("2026-09-03T11:00:00.000Z"),
      ),
    ).toBeNull();
    expect(decodeIntakeProgress("not-json")).toBeNull();
  });

  it("rejects stale, invalid, or cross-locale markers", () => {
    expect(
      decodeIntakeProgress(
        JSON.stringify({ ...valid, step: "unknown" }),
        new Date("2026-09-03T11:00:00.000Z"),
      ),
    ).toBeNull();
    expect(
      decodeIntakeProgress(
        JSON.stringify({ ...valid, locale: "fr-FR" }),
        new Date("2026-09-03T11:00:00.000Z"),
      ),
    ).toBeNull();
    expect(
      decodeIntakeProgress(
        JSON.stringify({ ...valid, savedAt: "yesterday" }),
        new Date("2026-09-03T11:00:00.000Z"),
      ),
    ).toBeNull();
    expect(
      decodeIntakeProgress(JSON.stringify(valid), new Date("2026-09-04T11:00:00.000Z")),
    ).toBeNull();
  });
});
