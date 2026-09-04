import { describe, expect, it, vi } from "vitest";
import type { DatabasePool } from "./pool";
import { createPostgresRateLimiter } from "./rate-limiter";

function pool() {
  return {
    query: vi.fn(),
  } as unknown as DatabasePool & { query: ReturnType<typeof vi.fn> };
}

describe("PostgreSQL shared rate limiter", () => {
  it("returns the database decision from one atomic upsert", async () => {
    const database = pool();
    database.query.mockResolvedValueOnce({
      rows: [{ allowed: true, remaining: 4, retry_after_seconds: 0 }],
      rowCount: null,
    });

    await expect(
      createPostgresRateLimiter(database).consume("owner:create", 5, 60_000),
    ).resolves.toEqual({
      allowed: true,
      remaining: 4,
      retryAfterSeconds: 0,
    });
    expect(database.query).toHaveBeenCalledTimes(1);
    expect(database.query.mock.calls[0]?.[0]).toContain("INSERT INTO shared_rate_limits");
    expect(database.query.mock.calls[0]?.[0]).toContain("ON CONFLICT (key) DO UPDATE");
  });

  it("bounds input before touching the database and cleans up bounded batches", async () => {
    const database = pool();
    const limiter = createPostgresRateLimiter(database);
    await expect(limiter.consume("", 5, 60_000)).rejects.toThrow("RATE_LIMIT_INPUT_INVALID");
    expect(database.query).not.toHaveBeenCalled();

    database.query.mockResolvedValueOnce({ rowCount: 3, rows: [] });
    await expect(limiter.purgeExpired(new Date("2026-09-01T00:00:00.000Z"), 10)).resolves.toBe(3);
    expect(database.query.mock.calls[0]?.[0]).toContain("FOR UPDATE SKIP LOCKED");
    expect(database.query.mock.calls[0]?.[1]?.[1]).toBe(10);
  });

  it("fails closed when PostgreSQL returns no decision", async () => {
    const database = pool();
    database.query.mockResolvedValueOnce({ rows: [], rowCount: null });
    await expect(
      createPostgresRateLimiter(database).consume("owner:get", 30, 60_000),
    ).rejects.toThrow("RATE_LIMIT_UNAVAILABLE");
  });
});
