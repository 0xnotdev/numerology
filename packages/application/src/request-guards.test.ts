import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rate-limiter";
import { verifyCsrfToken } from "./request-guards";

describe("unsafe request guards", () => {
  it("compares CSRF tokens in constant time and refuses malformed values", () => {
    expect(verifyCsrfToken("csrf-token", "csrf-token")).toBe(true);
    expect(verifyCsrfToken("csrf-token", "csrf-tokeN")).toBe(false);
    expect(verifyCsrfToken("csrf-token", "")).toBe(false);
    expect(verifyCsrfToken("csrf-token", "csrf-token".repeat(1_000))).toBe(false);
  });

  it("enforces an injected-clock window without recording request data", () => {
    let now = new Date("2026-09-03T00:00:00.000Z");
    const limiter = createRateLimiter({ clock: { now: () => now } });
    expect(limiter.consume("opaque-principal:patch", 2, 60_000)).toMatchObject({
      allowed: true,
      remaining: 1,
    });
    expect(limiter.consume("opaque-principal:patch", 2, 60_000)).toMatchObject({
      allowed: true,
      remaining: 0,
    });
    expect(limiter.consume("opaque-principal:patch", 2, 60_000)).toMatchObject({
      allowed: false,
      retryAfterSeconds: 60,
    });
    now = new Date("2026-09-03T00:01:01.000Z");
    expect(limiter.consume("opaque-principal:patch", 2, 60_000)).toMatchObject({
      allowed: true,
      remaining: 1,
    });
  });
});
