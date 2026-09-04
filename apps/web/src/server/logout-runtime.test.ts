import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createLogoutHandler } from "./logout-runtime";
const token = "a".repeat(43),
  csrf = "b".repeat(43),
  origin = "https://numerology.test";
function request(header = csrf) {
  return new Request(`${origin}/api/v1/auth/logout`, {
    method: "POST",
    headers: {
      origin,
      cookie: `__Host-numerology_session=${token}; __Host-numerology_csrf=${csrf}; report_draft=signed`,
      "x-csrf-token": header,
    },
  });
}
describe("logout", () => {
  it("revokes only the matching session and clears authentication cookies", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1 });
    const response = await createLogoutHandler({
      pool: { query } as never,
      origin,
      now: () => new Date("2026-09-04T00:00:00Z"),
    })(request());
    expect(response.status).toBe(204);
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[1]?.[0]).toEqual(
      createHash("sha256").update(`numerology:session:v1:${token}`).digest(),
    );
    expect(response.headers.getSetCookie()).toHaveLength(3);
  });
  it("rejects missing synchronizer proof without touching persistence", async () => {
    const query = vi.fn();
    const response = await createLogoutHandler({ pool: { query } as never, origin })(
      request("wrong"),
    );
    expect(response.status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });
});
