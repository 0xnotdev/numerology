import {
  createReportIntentCommands,
  IdempotencyConflictError,
  IdempotencyExpiredError,
  IdempotencyInProgressError,
  type ReportIntentCommandDependencies,
  type ReportIntentHttpDependencies,
  serializeProtectedField,
} from "@numerology/application";
import type { DatabasePool } from "./pool";
import { createReportIntentRepository } from "./report-intent-repository";

const PURPOSE = "report_intent_create_response" as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

/** The create and encrypted replay response share one PostgreSQL commit, including crash rollback. */
export function createPostgresCreateIdempotency(
  pool: DatabasePool,
  dependencies: Omit<ReportIntentCommandDependencies, "repository">,
): ReportIntentHttpDependencies["createIdempotency"] {
  return {
    async execute(request, operation) {
      if (
        request.operation !== "report-intents.create" ||
        ![request.key, request.ownerPrincipalId, request.resourceId].every((value) =>
          UUID.test(value),
        ) ||
        !/^sha256:[0-9a-f]{64}$/u.test(request.requestFingerprint)
      )
        throw new RangeError("IDEMPOTENCY_REQUEST_INVALID");
      const client = await pool.connect();
      let releaseError: Error | undefined;
      // A checked-out pg client can emit errors while application code is between queries.
      const onConnectionError = (error: Error) => {
        releaseError = error;
      };
      client.on("error", onConnectionError);
      try {
        await client.query("BEGIN");
        await client.query("SET LOCAL statement_timeout = '10s'");
        await client.query("SET LOCAL idle_in_transaction_session_timeout = '15s'");
        const lock = await client.query<{ acquired: boolean }>(
          "SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS acquired",
          [JSON.stringify([request.ownerPrincipalId, request.operation, request.key])],
        );
        if (!lock.rows[0]?.acquired) throw new IdempotencyInProgressError();
        const existing = await client.query<{
          request_fingerprint: string;
          resource_id: string;
          expires_at: Date;
          response_ciphertext: Buffer;
        }>(
          `SELECT request_fingerprint, resource_id, expires_at, response_ciphertext
             FROM report_intent_create_requests WHERE owner_principal_id = $1 AND operation = $2 AND key = $3`,
          [request.ownerPrincipalId, request.operation, request.key],
        );
        const now = dependencies.clock.now();
        const row = existing.rows[0];
        if (row) {
          if (
            row.request_fingerprint !== request.requestFingerprint.slice(7) ||
            row.resource_id !== request.resourceId
          )
            throw new IdempotencyConflictError();
          if (row.expires_at.valueOf() <= now.valueOf()) throw new IdempotencyExpiredError();
          const stored: unknown = JSON.parse(
            await dependencies.protector.reveal(row.response_ciphertext, PURPOSE),
          );
          if (
            typeof stored !== "object" ||
            stored === null ||
            !("body" in stored) ||
            !("cookie" in stored) ||
            typeof stored.cookie !== "string"
          )
            throw new Error("IDEMPOTENCY_RESPONSE_INVALID");
          await client.query("COMMIT");
          return { body: stored.body, cookie: stored.cookie };
        }
        const window = request.expiresAt.valueOf() - now.valueOf();
        if (!Number.isFinite(window) || window <= 0 || window > 86400000)
          throw new RangeError("IDEMPOTENCY_EXPIRY_INVALID");
        const commands = createReportIntentCommands({
          ...dependencies,
          repository: createReportIntentRepository(client),
        });
        const response = await operation(commands);
        const protectedResponse = await dependencies.protector.protect(
          JSON.stringify(response),
          PURPOSE,
        );
        await client.query(
          `INSERT INTO report_intent_create_requests
             (owner_principal_id, operation, key, resource_id, request_fingerprint, response_ciphertext, expires_at, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            request.ownerPrincipalId,
            request.operation,
            request.key,
            request.resourceId,
            request.requestFingerprint.slice(7),
            Buffer.from(serializeProtectedField(protectedResponse)),
            request.expiresAt,
            now,
          ],
        );
        await client.query("COMMIT");
        return response;
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {
          releaseError = new Error("IDEMPOTENCY_CONNECTION_UNAVAILABLE");
        }
        throw error;
      } finally {
        if (!releaseError) client.removeListener("error", onConnectionError);
        client.release(releaseError);
      }
    },
  };
}
