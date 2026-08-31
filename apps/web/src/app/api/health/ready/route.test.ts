import { describe, expect, it } from "vitest";
import { createReadinessHandler } from "./route";

describe("GET /api/health/ready", () => {
  it("fails safely when the database probe throws", async () => {
    const GET = createReadinessHandler({
      check: async () => {
        throw new Error("postgres://user:secret@database.internal/numerology");
      },
    });

    const response = await GET();
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(JSON.parse(body)).toEqual({
      service: "numerology-web",
      status: "unavailable",
    });
    expect(body).not.toContain("secret");
    expect(body).not.toContain("database.internal");
  });

  it("returns HTTP 200 only when the database probe is ready", async () => {
    const GET = createReadinessHandler({ check: async () => true });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      service: "numerology-web",
      status: "ok",
    });
  });
});
