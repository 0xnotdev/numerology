import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

describe("private route response headers", () => {
  it("applies restrictive browser and crawler policy to account and report routes", async () => {
    const entries = await nextConfig.headers?.();
    const privateEntry = entries?.find(({ source }) => source === "/:locale/account");
    const reportEntry = entries?.find(({ source }) => source === "/:locale/reports/:reportId");

    for (const entry of [privateEntry, reportEntry]) {
      const headers = Object.fromEntries(
        entry?.headers.map(({ key, value }) => [key.toLowerCase(), value]) ?? [],
      );
      expect(headers["cache-control"]).toBe("private, no-store, max-age=0");
      expect(headers["x-robots-tag"]).toBe("noindex, nofollow");
      expect(headers["referrer-policy"]).toBe("no-referrer");
    }
  });
});
