import { describe, expect, it } from "vitest";
import { getPrivacyNotice, PRIVACY_NOTICE_VERSION } from "./privacy-notice";

describe("intake privacy notice v1", () => {
  it("is independently understandable and itemizes every required disclosure", () => {
    const notice = getPrivacyNotice("en-IN");
    const text = [
      ...notice.items.map((item) => `${item.label} ${item.body}`),
      notice.contact,
      notice.rights,
      notice.grievance,
      notice.eighteenPlus,
    ].join(" ");

    expect(notice.version).toBe(PRIVACY_NOTICE_VERSION);
    expect(text).toContain("The Numbered Life");
    expect(text).toContain("privacy@thenumberedlife.example");
    expect(text).toContain("name");
    expect(text).toContain("date of birth");
    expect(text).toContain("purpose");
    expect(text).toContain("Google Cloud");
    expect(text).toContain("Mumbai");
    expect(text).toContain("Razorpay");
    expect(text).toContain("Amazon SES");
    expect(text).toContain("7 days");
    expect(text).toContain("export");
    expect(text).toContain("erasure");
    expect(text).toContain("grievance");
    expect(text).toContain("breach");
    expect(text).toContain("18+");
  });

  it("does not claim that this unconnected UI has already saved a complete draft", () => {
    const notice = getPrivacyNotice("en-IN");
    const text = [...notice.items.map((item) => item.body), notice.contact].join(" ");

    expect(text).not.toContain("complete draft is saved server-side");
    expect(text).toContain("not written to browser storage");
  });
});
