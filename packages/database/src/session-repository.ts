import type { SessionRepository } from "@numerology/application";
import type { DatabasePool } from "./pool";

/** Read-only session verification; issuing sessions belongs to the sign-in flow. */
export function createPostgresSessionRepository(pool: DatabasePool): SessionRepository {
  return {
    async findActive(tokenDigest, now) {
      if (tokenDigest.byteLength !== 32 || !Number.isFinite(now.valueOf())) return null;
      const result = await pool.query<{
        principal_id: string;
        csrf_digest: Buffer;
        authenticated_at: Date;
        session_id: string;
      }>(
        `SELECT principal_id, csrf_digest, created_at AS authenticated_at, id AS session_id FROM sessions
          WHERE token_digest = $1 AND revoked_at IS NULL
            AND created_at <= $2 AND expires_at > $2 AND absolute_expires_at > $2`,
        [Buffer.from(tokenDigest), now],
      );
      const row = result.rows[0];
      return row
        ? {
            csrfDigest: row.csrf_digest,
            principalId: row.principal_id,
            ...(row.authenticated_at === undefined
              ? {}
              : { authenticatedAt: row.authenticated_at }),
            ...(row.session_id === undefined ? {} : { sessionId: row.session_id }),
          }
        : null;
    },
  };
}

/**
 * Revokes one session only when its token and synchronizer token both match. The comparison is
 * performed in PostgreSQL so a request cannot verify one session and revoke another concurrently.
 */
export async function revokePostgresSession(
  pool: DatabasePool,
  tokenDigest: Uint8Array,
  csrfDigest: Uint8Array,
  now: Date,
): Promise<boolean> {
  if (
    tokenDigest.byteLength !== 32 ||
    csrfDigest.byteLength !== 32 ||
    !Number.isFinite(now.valueOf())
  ) {
    throw new RangeError("SESSION_REVOCATION_INPUT_INVALID");
  }
  const result = await pool.query(
    `UPDATE sessions SET revoked_at = $4
      WHERE token_digest = $1 AND csrf_digest = $2 AND revoked_at IS NULL
        AND created_at <= $3 AND expires_at > $3 AND absolute_expires_at > $3`,
    [Buffer.from(tokenDigest), Buffer.from(csrfDigest), now, now],
  );
  return (result.rowCount ?? 0) === 1;
}
