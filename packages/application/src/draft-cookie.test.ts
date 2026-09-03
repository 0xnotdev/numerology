import { describe, expect, it } from "vitest";
import { createDraftCookie, verifyDraftCookie } from "./draft-cookie";

const SECRET = "test-secret-that-is-long-enough";
const payload = {
  expiresAt: "2026-09-10T00:00:00.000Z",
  intentId: "00000000-0000-4000-8000-000000000003",
} as const;

describe("signed draft cookie", () => {
  it("round-trips only an opaque intent and expiry without PII or mutable version state", () => {
    const cookie = createDraftCookie(payload, SECRET, new Date("2026-09-03T00:00:00.000Z"));
    expect(cookie).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u);
    expect(verifyDraftCookie(cookie, SECRET, new Date("2026-09-03T00:00:00.000Z"))).toEqual(
      payload,
    );
    expect(cookie).not.toContain("person@example.com");
    expect(JSON.stringify(payload)).not.toContain("version");
  });

  it("rejects tampering, wrong secrets, expired payloads, and unknown fields", () => {
    const cookie = createDraftCookie(payload, SECRET, new Date("2026-09-03T00:00:00.000Z"));
    const [version, body, signature] = cookie.split(".");
    expect(
      verifyDraftCookie(
        `${version}.${body}A.${signature}`,
        SECRET,
        new Date("2026-09-03T00:00:00.000Z"),
      ),
    ).toBeNull();
    expect(
      verifyDraftCookie(
        cookie,
        "wrong-secret-that-is-long-enough",
        new Date("2026-09-03T00:00:00.000Z"),
      ),
    ).toBeNull();
    expect(verifyDraftCookie(cookie, SECRET, new Date("2026-09-11T00:00:00.000Z"))).toBeNull();
    const unknown = Buffer.from(
      JSON.stringify({ ...payload, email: "person@example.com" }),
    ).toString("base64url");
    const forged = `v1.${unknown}.${signature}`;
    expect(verifyDraftCookie(forged, SECRET, new Date("2026-09-03T00:00:00.000Z"))).toBeNull();
  });
});
