import type { SessionRepository } from "@numerology/application";
import type { DatabasePool } from "./pool";

/** Read-only session verification; issuing sessions belongs to the sign-in flow. */
export function createPostgresSessionRepository(pool: DatabasePool): SessionRepository {
  return {
    async findActive(tokenDigest, now) {
      if (tokenDigest.byteLength !== 32 || !Number.isFinite(now.valueOf())) return null;
      const result = await pool.query<{ principal_id: string; csrf_digest: Buffer }>(
        `SELECT principal_id, csrf_digest FROM sessions
          WHERE token_digest = $1 AND revoked_at IS NULL
            AND created_at <= $2 AND expires_at > $2 AND absolute_expires_at > $2`,
        [Buffer.from(tokenDigest), now],
      );
      const row = result.rows[0];
      return row ? { principalId: row.principal_id, csrfDigest: row.csrf_digest } : null;
    },
  };
}
