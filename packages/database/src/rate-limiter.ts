import type { RateLimitDecision } from "@numerology/application";
import type { DatabasePool } from "./pool";

const MAX_KEY_LENGTH = 256;
const MAX_LIMIT = 1_000;
const MIN_WINDOW_MS = 1_000;
const MAX_WINDOW_MS = 86_400_000;
const MAX_AGE_MS = 86_400_000;

function validateInput(key: string, limit: number, windowMs: number): void {
  if (
    key.length === 0 ||
    key.length > MAX_KEY_LENGTH ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > MAX_LIMIT ||
    !Number.isSafeInteger(windowMs) ||
    windowMs < MIN_WINDOW_MS ||
    windowMs > MAX_WINDOW_MS
  ) {
    throw new RangeError("RATE_LIMIT_INPUT_INVALID");
  }
}

function validatePurge(now: Date, limit: number): void {
  if (
    !Number.isFinite(now.valueOf()) ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > MAX_LIMIT
  ) {
    throw new RangeError("RATE_LIMIT_CLEANUP_INPUT_INVALID");
  }
}

/**
 * PostgreSQL-backed fixed-window limiter shared by every web process.
 *
 * The upsert is one statement and caps rejected requests at limit + 1. This keeps the row bounded
 * while retaining an explicit denied state; cleanup is intentionally separate and bounded.
 */
export function createPostgresRateLimiter(pool: DatabasePool) {
  return {
    async consume(key: string, limit: number, windowMs: number): Promise<RateLimitDecision> {
      validateInput(key, limit, windowMs);
      const result = await pool.query<{
        allowed: boolean;
        remaining: number;
        retry_after_seconds: number;
      }>(
        `WITH candidate AS (
          SELECT clock_timestamp() AS sampled_at
        ), written AS (
          INSERT INTO shared_rate_limits (key, window_started_at, count, updated_at)
          SELECT $1, sampled_at, 1, sampled_at FROM candidate
          ON CONFLICT (key) DO UPDATE SET
            count = CASE
              WHEN shared_rate_limits.window_started_at + ($3::double precision * interval '1 millisecond') <= EXCLUDED.updated_at
                THEN 1
              ELSE LEAST(shared_rate_limits.count + 1, $2 + 1)
            END,
            window_started_at = CASE
              WHEN shared_rate_limits.window_started_at + ($3::double precision * interval '1 millisecond') <= EXCLUDED.updated_at
                THEN EXCLUDED.updated_at
              ELSE shared_rate_limits.window_started_at
            END,
            updated_at = EXCLUDED.updated_at
          RETURNING count, window_started_at, updated_at
        )
        SELECT count <= $2 AS allowed,
          GREATEST(0, $2 - count)::integer AS remaining,
          CASE WHEN count <= $2 THEN 0
            ELSE GREATEST(1, CEIL(EXTRACT(EPOCH FROM (
              (window_started_at + ($3::double precision * interval '1 millisecond')) - updated_at
            ))))::integer
          END AS retry_after_seconds
        FROM written`,
        [key, limit, windowMs],
      );
      const decision = result.rows[0];
      if (decision === undefined) throw new Error("RATE_LIMIT_UNAVAILABLE");
      return {
        allowed: decision.allowed,
        remaining: decision.remaining,
        retryAfterSeconds: decision.retry_after_seconds,
      };
    },

    async purgeExpired(now: Date, limit: number): Promise<number> {
      validatePurge(now, limit);
      const result = await pool.query(
        `WITH due AS (
          SELECT key FROM shared_rate_limits
          WHERE updated_at <= $1 - ($3::double precision * interval '1 millisecond')
          ORDER BY updated_at
          LIMIT $2
          FOR UPDATE SKIP LOCKED
        )
        DELETE FROM shared_rate_limits AS bucket
        USING due
        WHERE bucket.key = due.key`,
        [now, limit, MAX_AGE_MS],
      );
      return result.rowCount ?? 0;
    },
  };
}

export type PostgresRateLimiter = ReturnType<typeof createPostgresRateLimiter>;
