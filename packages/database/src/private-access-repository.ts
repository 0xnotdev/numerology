import {
  PrivateAccessIdempotencyConflictError,
  type EntitledPrivateReportRecord,
  type PrivateAccessRepository,
  type PrivateAuditEventInput,
  type PrivateLifecycleAction,
  type PrivateLifecycleRequestReceipt,
} from "@numerology/application";
import type { PoolClient } from "pg";
import type { DatabasePool } from "./pool";
import { createPostgresTransactionRunner } from "./transaction-runner";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const HASH = /^sha256:[0-9a-f]{64}$/u;
const SAFE = /^[A-Za-z0-9._:-]{1,64}$/u;
const AUDIT_ACTIONS = new Set([
  "private.account.denied",
  "private.account.read",
  "private.report.denied",
  "private.report.read",
  "private.request.denied",
  "private.request.accepted",
  "private.report.signed_pdf.denied",
  "private.report.signed_pdf.unavailable",
  "private.sessions.revoke_all",
  "private.sessions.revoke_all.denied",
]);
const AUDIT_REASONS = new Set([
  "UNAUTHENTICATED",
  "CSRF_REQUIRED",
  "REPORT_NOT_FOUND",
  "REAUTHENTICATION_REQUIRED",
  "IDEMPOTENCY_KEY_REQUIRED",
  "IDEMPOTENCY_KEY_CONFLICT",
  "REQUEST_INVALID",
  "SIGNED_PDF_UNAVAILABLE",
]);
const EMPTY_TARGET = "00000000-0000-4000-8000-000000000000";
const AUDIT_METADATA_KEYS = new Set(["count", "outcome"]);

function validDate(value: Date): boolean {
  return value instanceof Date && Number.isFinite(value.valueOf());
}

function validId(value: string): boolean {
  return UUID.test(value);
}

function toReport(row: {
  id: string;
  locale: EntitledPrivateReportRecord["locale"];
  ready_at: Date;
  status: "ready";
  structured_report_ciphertext: Buffer;
  calculation_snapshot_ciphertext: Buffer;
  verification_json: unknown;
}): EntitledPrivateReportRecord {
  return {
    calculationSnapshotCiphertext: row.calculation_snapshot_ciphertext,
    id: row.id,
    locale: row.locale,
    readyAt: row.ready_at,
    status: row.status,
    structuredReportCiphertext: row.structured_report_ciphertext,
    verificationJson: row.verification_json,
  };
}

function validateAudit(event: PrivateAuditEventInput): void {
  if (
    !validId(event.id) ||
    !["principal", "system", "support"].includes(event.actorType) ||
    (event.actorPrincipalId !== undefined && !validId(event.actorPrincipalId)) ||
    !AUDIT_ACTIONS.has(event.action) ||
    !["account", "report", "private_request", "session"].includes(event.targetType) ||
    !validId(event.targetId) ||
    (event.reasonCode !== undefined && !AUDIT_REASONS.has(event.reasonCode)) ||
    !SAFE.test(event.correlationId) ||
    !validDate(event.occurredAt)
  ) {
    throw new RangeError("AUDIT_EVENT_INVALID");
  }
  if (event.safeMetadata !== undefined) {
    for (const [key, value] of Object.entries(event.safeMetadata)) {
      if (!AUDIT_METADATA_KEYS.has(key)) throw new RangeError("AUDIT_METADATA_INVALID");
      if (
        key === "outcome" &&
        !["denied", "success", "accepted", "unavailable"].includes(String(value))
      )
        throw new RangeError("AUDIT_METADATA_INVALID");
      if (
        key === "count" &&
        (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
      )
        throw new RangeError("AUDIT_METADATA_INVALID");
      if (
        typeof value !== "string" &&
        typeof value !== "number" &&
        typeof value !== "boolean" &&
        value !== null
      )
        throw new RangeError("AUDIT_METADATA_INVALID");
    }
  }
}

function validateLifecycleInput(input: {
  readonly id: string;
  readonly principalId: string;
  readonly reportId: string;
  readonly action: PrivateLifecycleAction;
  readonly idempotencyKey: string;
  readonly requestFingerprint: string;
  readonly correlationId: string;
  readonly auditEventId: string;
  readonly now: Date;
}): void {
  if (
    !validId(input.id) ||
    !validId(input.principalId) ||
    !validId(input.reportId) ||
    !["correction", "export", "deletion"].includes(input.action) ||
    !validId(input.idempotencyKey) ||
    !HASH.test(input.requestFingerprint) ||
    !validId(input.auditEventId) ||
    !SAFE.test(input.correlationId) ||
    !validDate(input.now)
  ) {
    throw new RangeError("PRIVATE_ACCESS_REQUEST_INVALID");
  }
}

const AUDIT_COLUMNS = `
  INSERT INTO audit_events
    (id, actor_type, actor_principal_id, action, target_type, target_id, reason_code,
     correlation_id, safe_metadata, occurred_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)`;

async function insertAudit(client: Pick<PoolClient, "query">, event: PrivateAuditEventInput) {
  validateAudit(event);
  await client.query(AUDIT_COLUMNS, [
    event.id,
    event.actorType,
    event.actorPrincipalId ?? null,
    event.action,
    event.targetType,
    event.targetId,
    event.reasonCode ?? null,
    event.correlationId,
    JSON.stringify(event.safeMetadata ?? {}),
    event.occurredAt,
  ]);
}

/**
 * PostgreSQL adapter for the private-access module. Authorization is intentionally expressed in
 * the report SELECT, keeping owner, order, entitlement, action, and lifecycle checks together.
 */
export function createPostgresPrivateAccessRepository(pool: DatabasePool): PrivateAccessRepository {
  const transactions = createPostgresTransactionRunner(pool);
  async function findMany(principalId: string, now: Date, reportId?: string) {
    if (
      !validId(principalId) ||
      !validDate(now) ||
      (reportId !== undefined && !validId(reportId))
    ) {
      return [] as EntitledPrivateReportRecord[];
    }
    const filter = reportId === undefined ? "" : "AND r.id = $3";
    const values = reportId === undefined ? [principalId, now] : [principalId, now, reportId];
    const result = await pool.query<{
      id: string;
      locale: EntitledPrivateReportRecord["locale"];
      ready_at: Date;
      status: "ready";
      structured_report_ciphertext: Buffer;
      calculation_snapshot_ciphertext: Buffer;
      verification_json: unknown;
    }>(
      `SELECT r.id, r.locale, r.status, r.ready_at,
              r.structured_report_ciphertext, r.calculation_snapshot_ciphertext, r.verification_json
         FROM principals AS p
         JOIN entitlements AS e
           ON e.principal_id = p.id
         JOIN reports AS r
           ON r.id = e.report_id
          AND r.status = 'ready'
         JOIN orders AS o
           ON o.id = e.source_order_id
          AND o.id = r.order_id
          AND o.principal_id = p.id
        WHERE p.id = $1
          AND e.principal_id = $1
          AND e.revoked_at IS NULL
          AND e.granted_at <= $2
          AND 'view' = ANY(e.actions)
          ${filter}
        ORDER BY r.ready_at DESC, r.id ASC`,
      values,
    );
    return result.rows.map(toReport);
  }

  return {
    async listEntitledReports(principalId, now) {
      return findMany(principalId, now);
    },

    async findEntitledReport(principalId, reportId, now) {
      const rows = await findMany(principalId, now, reportId);
      return rows[0] ?? null;
    },

    async createLifecycleRequest(input) {
      validateLifecycleInput(input);
      const result = await transactions.run(async (client) => {
        const inserted = await client.query<{
          id: string;
          action: PrivateLifecycleAction;
          status: "requested";
          created_at: Date;
        }>(
          `WITH authorized AS (
             SELECT r.id AS report_id
               FROM principals AS p
               JOIN entitlements AS e
                 ON e.principal_id = p.id
                AND e.revoked_at IS NULL
                AND e.granted_at <= $7
                AND 'view' = ANY(e.actions)
               JOIN reports AS r
                 ON r.id = e.report_id AND r.status = 'ready'
               JOIN orders AS o
                 ON o.id = e.source_order_id
                AND o.id = r.order_id
                AND o.principal_id = p.id
              WHERE p.id = $2 AND e.principal_id = $2 AND r.id = $3
           )
           INSERT INTO private_access_requests
             (id, principal_id, report_id, action, idempotency_key, request_fingerprint,
              status, created_at, updated_at)
           SELECT $1, $2, report_id, $4, $5, $6, 'requested', $7, $7
             FROM authorized
           ON CONFLICT (principal_id, report_id, idempotency_key) DO NOTHING
           RETURNING id, action, status, created_at`,
          [
            input.id,
            input.principalId,
            input.reportId,
            input.action,
            input.idempotencyKey,
            input.requestFingerprint,
            input.now,
          ],
        );

        let receipt: PrivateLifecycleRequestReceipt | null = null;
        if (inserted.rows[0] !== undefined) {
          const row = inserted.rows[0];
          receipt = {
            action: row.action,
            id: row.id,
            requestedAt: row.created_at,
            status: row.status,
          };
        } else {
          const existing = await client.query<{
            id: string;
            action: PrivateLifecycleAction;
            request_fingerprint: string;
            status: "requested";
            created_at: Date;
          }>(
            `SELECT pr.id, pr.action, pr.request_fingerprint, pr.status, pr.created_at
               FROM private_access_requests AS pr
               JOIN principals AS p ON p.id = pr.principal_id
               JOIN entitlements AS e
                 ON e.principal_id = p.id AND e.report_id = pr.report_id
                AND e.revoked_at IS NULL AND e.granted_at <= $4 AND 'view' = ANY(e.actions)
               JOIN reports AS r ON r.id = pr.report_id AND r.status = 'ready'
               JOIN orders AS o ON o.id = e.source_order_id AND o.id = r.order_id
                AND o.principal_id = p.id
              WHERE pr.principal_id = $1 AND pr.report_id = $2 AND pr.idempotency_key = $3
              LIMIT 1`,
            [input.principalId, input.reportId, input.idempotencyKey, input.now],
          );
          const row = existing.rows[0];
          if (
            row !== undefined &&
            (row.action !== input.action || row.request_fingerprint !== input.requestFingerprint)
          ) {
            await insertAudit(client, {
              action: "private.request.denied",
              actorPrincipalId: input.principalId,
              actorType: "principal",
              correlationId: input.correlationId,
              id: input.auditEventId,
              occurredAt: input.now,
              reasonCode: "IDEMPOTENCY_KEY_CONFLICT",
              safeMetadata: { outcome: "denied" },
              targetId: row.id,
              targetType: "private_request",
            });
            return "conflict" as const;
          } else if (row !== undefined) {
            receipt = {
              action: row.action,
              id: row.id,
              requestedAt: row.created_at,
              status: row.status,
            };
          }
        }

        await insertAudit(client, {
          action: receipt === null ? "private.request.denied" : "private.request.accepted",
          actorPrincipalId: input.principalId,
          actorType: "principal",
          correlationId: input.correlationId,
          id: input.auditEventId,
          occurredAt: input.now,
          ...(receipt === null ? { reasonCode: "REPORT_NOT_FOUND" } : {}),
          safeMetadata: { outcome: receipt === null ? "denied" : "accepted" },
          targetId: receipt === null ? input.reportId : receipt.id,
          targetType: receipt === null ? "report" : "private_request",
        });
        return receipt;
      });
      if (result === "conflict") throw new PrivateAccessIdempotencyConflictError();
      return result;
    },

    async revokeAllSessions(input) {
      if (
        !validId(input.principalId) ||
        !validId(input.auditEventId) ||
        !SAFE.test(input.correlationId) ||
        !validDate(input.now)
      ) {
        throw new RangeError("SESSION_REVOCATION_INPUT_INVALID");
      }
      return transactions.run(async (client) => {
        const result = await client.query(
          `UPDATE sessions
              SET revoked_at = $2
            WHERE principal_id = $1 AND revoked_at IS NULL
              AND created_at <= $2 AND expires_at > $2 AND absolute_expires_at > $2`,
          [input.principalId, input.now],
        );
        await insertAudit(client, {
          action: "private.sessions.revoke_all",
          actorPrincipalId: input.principalId,
          actorType: "principal",
          correlationId: input.correlationId,
          id: input.auditEventId,
          occurredAt: input.now,
          safeMetadata: { count: result.rowCount ?? 0, outcome: "success" },
          targetId: EMPTY_TARGET,
          targetType: "session",
        });
        return result.rowCount ?? 0;
      });
    },

    async appendAudit(event) {
      await insertAudit(pool, event);
    },
  };
}

export const createPrivateAccessRepository = createPostgresPrivateAccessRepository;
