import { describe, expect, it, vi } from "vitest";
import type { DatabasePool } from "./pool";
import { createPostgresSessionRepository, revokePostgresSession } from "./session-repository";

function pool() {
  return {
    query: vi.fn(),
  } as unknown as DatabasePool & { query: ReturnType<typeof vi.fn> };
}

describe("PostgreSQL session repository", () => {
  it("returns only an active principal and synchronizer digest", async () => {
    const database = pool();
    database.query.mockResolvedValueOnce({
      rows: [{ principal_id: "principal-1", csrf_digest: Buffer.alloc(32, 7) }],
    });
    await expect(
      createPostgresSessionRepository(database).findActive(
        Buffer.alloc(32, 8),
        new Date("2026-09-01T00:00:00.000Z"),
      ),
    ).resolves.toEqual({ principalId: "principal-1", csrfDigest: Buffer.alloc(32, 7) });
    expect(database.query.mock.calls[0]?.[0]).toContain("revoked_at IS NULL");
    expect(database.query.mock.calls[0]?.[0]).toContain("absolute_expires_at >");
  });

  it("atomically revokes a live session bound to the expected CSRF digest", async () => {
    const database = pool();
    database.query.mockResolvedValueOnce({ rowCount: 1 });
    await expect(
      revokePostgresSession(
        database,
        Buffer.alloc(32, 8),
        Buffer.alloc(32, 7),
        new Date("2026-09-01T00:00:00.000Z"),
      ),
    ).resolves.toBe(true);
    expect(database.query.mock.calls[0]?.[0]).toContain("csrf_digest = $2");
    expect(database.query.mock.calls[0]?.[1]).toEqual([
      Buffer.alloc(32, 8),
      Buffer.alloc(32, 7),
      new Date("2026-09-01T00:00:00.000Z"),
      new Date("2026-09-01T00:00:00.000Z"),
    ]);
  });

  it("rejects malformed revocation input without querying PostgreSQL", async () => {
    const database = pool();
    await expect(
      revokePostgresSession(database, Buffer.alloc(31), Buffer.alloc(32), new Date()),
    ).rejects.toThrow("SESSION_REVOCATION_INPUT_INVALID");
    expect(database.query).not.toHaveBeenCalled();
  });
});
