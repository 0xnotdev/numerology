import { describe, expect, it, vi } from "vitest";
import { maintenanceRoute, registerMaintenanceHandler } from "./maintenance-runtime";
describe("maintenance endpoint", () => {
  it("is hidden without authorization and runs one bounded batch with a valid bearer secret", async () => {
    const run = vi.fn().mockResolvedValue({
      expiredReportIntents: 1,
      purgedMagicLinks: 2,
      purgedRateLimits: 3,
      purgedSessions: 4,
    });
    registerMaintenanceHandler({ runner: { run } as never, secret: "s".repeat(32) });
    expect(
      (
        await maintenanceRoute(
          new Request("https://n.test/api/internal/maintenance", { method: "POST" }),
        )
      ).status,
    ).toBe(404);
    const response = await maintenanceRoute(
      new Request("https://n.test/api/internal/maintenance", {
        method: "POST",
        headers: { authorization: `Bearer ${"s".repeat(32)}` },
      }),
    );
    expect(response.status).toBe(200);
    expect(run).toHaveBeenCalledWith(expect.any(Date), 100);
  });
});
