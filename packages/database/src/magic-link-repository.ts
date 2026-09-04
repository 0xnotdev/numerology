import type { MagicLinkRepository } from "@numerology/application";
import type { DatabasePool } from "./pool";
import { createPostgresTransactionRunner } from "./transaction-runner";

export function createPostgresMagicLinkRepository(pool: DatabasePool): MagicLinkRepository {
  const transactions = createPostgresTransactionRunner(pool);
  return {
    async purgeExpired(now, limit) {
      if (!Number.isFinite(now.valueOf()) || !Number.isInteger(limit) || limit < 1 || limit > 1000)
        throw new RangeError("AUTH_CLEANUP_INPUT_INVALID");
      const redacted = await pool.query(
        `WITH due AS (
          SELECT id FROM access_challenges WHERE purpose = 'sign_in' AND expires_at <= $1
            AND pending_email_ciphertext IS NOT NULL ORDER BY expires_at LIMIT $2 FOR UPDATE SKIP LOCKED)
        UPDATE access_challenges AS challenge SET pending_email_ciphertext = NULL, consumed_at = COALESCE(consumed_at, $1)
        FROM due WHERE challenge.id = due.id`,
        [now, limit],
      );
      const removed = await pool.query(
        `WITH due AS (
          SELECT id FROM access_challenges WHERE purpose = 'sign_in' AND expires_at <= $1
            AND created_at <= $2 ORDER BY created_at LIMIT $3 FOR UPDATE SKIP LOCKED)
        DELETE FROM access_challenges AS challenge USING due WHERE challenge.id = due.id`,
        [now, new Date(now.valueOf() - 86400000), limit],
      );
      return (redacted.rowCount ?? 0) + (removed.rowCount ?? 0);
    },
    issue(input) {
      return transactions.run(async (client) => {
        await client.query("SET LOCAL statement_timeout = '10s'");
        const lock = await client.query<{ acquired: boolean }>(
          "SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS acquired",
          [`magic-link:${Buffer.from(input.emailLookupHmac).toString("hex")}`],
        );
        if (!lock.rows[0]?.acquired) return false;
        const budget = await client.query<{ count: string; latest: Date | null }>(
          "SELECT count(*) AS count, max(created_at) AS latest FROM access_challenges WHERE email_lookup_hmac = $1 AND purpose = 'sign_in' AND created_at > $2",
          [Buffer.from(input.emailLookupHmac), new Date(input.now.valueOf() - 3600000)],
        );
        const recent = budget.rows[0];
        if (
          Number(recent?.count ?? 0) >= 5 ||
          (recent?.latest && input.now.valueOf() - recent.latest.valueOf() < 60000)
        )
          return false;
        await client.query(
          "UPDATE access_challenges SET consumed_at = $2, pending_email_ciphertext = NULL WHERE email_lookup_hmac = $1 AND purpose = 'sign_in' AND consumed_at IS NULL",
          [Buffer.from(input.emailLookupHmac), input.now],
        );
        await client.query(
          `INSERT INTO access_challenges
          (id, email_lookup_hmac, purpose, token_digest, browser_digest, pending_email_ciphertext, pending_email_key_version, pending_locale, expires_at, created_at)
          VALUES ($1, $2, 'sign_in', $3, $4, $5, $6, $7, $8, $9)`,
          [
            input.id,
            Buffer.from(input.emailLookupHmac),
            Buffer.from(input.tokenDigest),
            Buffer.from(input.browserDigest),
            Buffer.from(input.emailCiphertext),
            input.emailKeyVersion,
            input.locale,
            input.expiresAt,
            input.now,
          ],
        );
        return true;
      });
    },
    async revokeChallenge(id, now) {
      await pool.query(
        "UPDATE access_challenges SET consumed_at = $2, pending_email_ciphertext = NULL WHERE id = $1 AND purpose = 'sign_in' AND consumed_at IS NULL",
        [id, now],
      );
    },
    consume(input) {
      return transactions.run(async (client) => {
        await client.query("SET LOCAL statement_timeout = '10s'");
        const result = await client.query<{
          id: string;
          email_lookup_hmac: Buffer;
          pending_email_ciphertext: Buffer;
          pending_email_key_version: number;
          pending_locale: "en-IN" | "hi-IN" | "or-IN";
        }>(
          `SELECT id, email_lookup_hmac, pending_email_ciphertext, pending_email_key_version, pending_locale
          FROM access_challenges WHERE token_digest = $1 AND browser_digest = $2 AND purpose = 'sign_in'
            AND consumed_at IS NULL AND created_at <= $3 AND expires_at > $3 AND attempts < 5
            AND pending_email_ciphertext IS NOT NULL AND pending_email_key_version IS NOT NULL AND pending_locale IS NOT NULL
          FOR UPDATE`,
          [Buffer.from(input.tokenDigest), Buffer.from(input.browserDigest), input.now],
        );
        const challenge = result.rows[0];
        if (!challenge) return false;
        await client.query(
          `INSERT INTO principals (id, email_ciphertext, email_lookup_hmac, email_key_version, locale, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $6) ON CONFLICT (email_lookup_hmac) DO NOTHING`,
          [
            input.principalId,
            challenge.pending_email_ciphertext,
            challenge.email_lookup_hmac,
            challenge.pending_email_key_version,
            challenge.pending_locale,
            input.now,
          ],
        );
        const principal = await client.query<{ id: string }>(
          "SELECT id FROM principals WHERE email_lookup_hmac = $1",
          [challenge.email_lookup_hmac],
        );
        const principalId = principal.rows[0]?.id;
        if (!principalId) throw new Error("PRINCIPAL_UNAVAILABLE");
        await client.query(
          `INSERT INTO sessions (id, principal_id, token_digest, csrf_digest, last_seen_at, expires_at, absolute_expires_at, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $6, $5)`,
          [
            input.sessionId,
            principalId,
            Buffer.from(input.sessionDigest),
            Buffer.from(input.csrfDigest),
            input.now,
            input.expiresAt,
          ],
        );
        await client.query(
          "UPDATE access_challenges SET consumed_at = $2, principal_id = $3, pending_email_ciphertext = NULL WHERE id = $1",
          [challenge.id, input.now, principalId],
        );
        return true;
      });
    },
  };
}
