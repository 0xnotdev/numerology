import { describe, expect, it, vi } from "vitest";
import type { DatabasePool } from "./pool";
import { purgeExpiredSessions } from "./maintenance";

function pool() {
  return {
    query: vi.fn(),
  } as unknown as DatabasePool & { query: ReturnType<typeof vi.fn> };
}

describe("bounded PostgreSQL maintenance", () => {
  it("purges only expired sessions with a bounded skip-locked batch", async () => {
    const database = pool();
    database.query.mockResolvedValueOnce({ rowCount: 2 });
    const now = new Date("2026-09-04T00:00:00.000Z");
    await expect(purgeExpiredSessions(database, now, 50)).resolves.toBe(2);
    expect(database.query.mock.calls[0]?.[0]).toContain("FOR UPDATE SKIP LOCKED");
    expect(database.query.mock.calls[0]?.[1]).toEqual([now, 50]);
  });

  it("rejects invalid limits before touching the database", async () => {
    const database = pool();
    await expect(purgeExpiredSessions(database, new Date(), 0)).rejects.toThrow(
      "MAINTENANCE_INPUT_INVALID",
    );
    expect(database.query).not.toHaveBeenCalled();
  });
});
