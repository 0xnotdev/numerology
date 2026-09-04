import type { DatabasePool } from "./pool";
import { createPostgresRateLimiter } from "./rate-limiter";

const MAX_LIMIT = 1_000;

export interface PostgresMaintenanceJobs {
  readonly expireReportIntents?: (limit: number) => Promise<number>;
  readonly purgeMagicLinks?: (now: Date, limit: number) => Promise<number>;
}

export interface PostgresMaintenanceResult {
  readonly expiredReportIntents: number;
  readonly purgedMagicLinks: number;
  readonly purgedRateLimits: number;
  readonly purgedSessions: number;
}

function validate(now: Date, limit: number): void {
  if (
    !Number.isFinite(now.valueOf()) ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > MAX_LIMIT
  ) {
    throw new RangeError("MAINTENANCE_INPUT_INVALID");
  }
}

/** Deletes only expired sessions, in a bounded SKIP LOCKED batch. */
export async function purgeExpiredSessions(
  pool: DatabasePool,
  now: Date,
  limit: number,
): Promise<number> {
  validate(now, limit);
  const result = await pool.query(
    `WITH due AS (
      SELECT id FROM sessions
      WHERE expires_at <= $1 OR absolute_expires_at <= $1
      ORDER BY expires_at
      LIMIT $2
      FOR UPDATE SKIP LOCKED
    )
    DELETE FROM sessions AS session
    USING due
    WHERE session.id = due.id`,
    [now, limit],
  );
  return result.rowCount ?? 0;
}

/**
 * Composes the bounded PostgreSQL cleanup work. Optional application jobs are injected so this
 * package does not recreate report-intent lifecycle policy or bypass its encrypted tombstone.
 */
export function createPostgresMaintenanceRunner(
  pool: DatabasePool,
  jobs: PostgresMaintenanceJobs = {},
) {
  const rateLimiter = createPostgresRateLimiter(pool);
  return {
    async run(now: Date, limit: number): Promise<PostgresMaintenanceResult> {
      validate(now, limit);
      const purgedRateLimits = await rateLimiter.purgeExpired(now, limit);
      const purgedSessions = await purgeExpiredSessions(pool, now, limit);
      const purgedMagicLinks = jobs.purgeMagicLinks ? await jobs.purgeMagicLinks(now, limit) : 0;
      const expiredReportIntents = jobs.expireReportIntents
        ? await jobs.expireReportIntents(limit)
        : 0;
      return {
        expiredReportIntents,
        purgedMagicLinks,
        purgedRateLimits,
        purgedSessions,
      };
    },
  };
}

export type PostgresMaintenanceRunner = ReturnType<typeof createPostgresMaintenanceRunner>;
