import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  configureReportIntentRuntime,
  getIntakePrivacyConfiguration,
} from "./report-intent-runtime";

describe("report-intent runtime configuration", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps intake privacy unavailable until a reviewed identity and contact are configured", () => {
    expect(getIntakePrivacyConfiguration()).toBeNull();
    vi.stubEnv("PRIVACY_REVIEWED", "true");
    vi.stubEnv("PRIVACY_CONTROLLER_NAME", "The Numbered Life");
    vi.stubEnv("PRIVACY_CONTACT_EMAIL", "privacy@thenumberedlife.example");
    vi.stubEnv("PRIVACY_NOTICE_VERSION", "privacy.2026-09-04.1");
    expect(getIntakePrivacyConfiguration()).toBeNull();
  });

  it("exposes only the public identity/contact projection after review", () => {
    vi.stubEnv("CUSTOMER_RUNTIME_ENABLED", "true");
    vi.stubEnv("PRIVACY_REVIEWED", "true");
    vi.stubEnv("PRIVACY_CONTROLLER_NAME", "The Numbered Life");
    vi.stubEnv("PRIVACY_CONTACT_EMAIL", "privacy@thenumberedlife.in");
    vi.stubEnv("PRIVACY_NOTICE_VERSION", "privacy.2026-09-04.1");
    expect(getIntakePrivacyConfiguration()).toEqual({
      contactEmail: "privacy@thenumberedlife.in",
      controllerName: "The Numbered Life",
    });
  });

  it("rejects unreviewed privacy settings before composing any runtime", () => {
    const options = {
      draftCookieSecret: "a".repeat(32),
      origin: "https://app.thenumberedlife.in",
      pool: {} as never,
      privacy: {
        contactEmail: "privacy@thenumberedlife.example",
        controllerName: "The Numbered Life",
        noticeVersion: "privacy.2026-09-04.1",
        reviewed: true as const,
      },
      protector: {} as never,
    };
    expect(() => configureReportIntentRuntime(options)).toThrow("PRIVACY_CONFIGURATION_UNREVIEWED");
  });
});
