import { randomUUID } from "node:crypto";
import { canonicalHash } from "@numerology/engine";
import {
  parseStructuredReport,
  projectCustomerDelivery,
  type CustomerDeliveryProjection,
} from "@numerology/report";
import { z } from "zod";
import type { Clock } from "./clock";
import type { FieldProtector } from "./field-protection";
import type { IdGenerator } from "./id-generator";
import {
  createSessionAuthentication,
  PRIVATE_CSRF_COOKIE,
  PRIVATE_SESSION_COOKIE,
  type AuthenticatedSession,
  type SessionAuthentication,
  type SessionRepository,
} from "./session-authentication";

export type PrivateLifecycleAction = "correction" | "export" | "deletion";

export interface EntitledPrivateReportRecord {
  readonly id: string;
  readonly locale: "en-IN" | "hi-IN" | "or-IN";
  readonly status: "ready";
  readonly readyAt: Date;
  readonly structuredReportCiphertext: Uint8Array;
  readonly calculationSnapshotCiphertext: Uint8Array;
  readonly verificationJson: unknown;
}

export interface PrivateLifecycleRequestReceipt {
  readonly id: string;
  readonly action: PrivateLifecycleAction;
  readonly status: "requested";
  readonly requestedAt: Date;
}

export type PrivateAuditAction =
  | "private.account.denied"
  | "private.account.read"
  | "private.report.denied"
  | "private.report.read"
  | "private.request.denied"
  | "private.request.accepted"
  | "private.report.signed_pdf.denied"
  | "private.report.signed_pdf.unavailable"
  | "private.sessions.revoke_all"
  | "private.sessions.revoke_all.denied";
export type PrivateAuditReason =
  | "UNAUTHENTICATED"
  | "CSRF_REQUIRED"
  | "REPORT_NOT_FOUND"
  | "REAUTHENTICATION_REQUIRED"
  | "IDEMPOTENCY_KEY_REQUIRED"
  | "IDEMPOTENCY_KEY_CONFLICT"
  | "REQUEST_INVALID"
  | "SIGNED_PDF_UNAVAILABLE";

export interface PrivateAuditEventInput {
  readonly id: string;
  readonly actorType: "principal" | "system" | "support";
  readonly actorPrincipalId?: string;
  readonly action: PrivateAuditAction;
  readonly targetType: "account" | "report" | "private_request" | "session";
  readonly targetId: string;
  readonly reasonCode?: PrivateAuditReason;
  readonly correlationId: string;
  readonly safeMetadata?: Readonly<{
    count?: number;
    outcome: "denied" | "success" | "accepted" | "unavailable";
  }>;
  readonly occurredAt: Date;
}

export interface PrivateAccessRepository {
  /** One owner/entitlement/order-scoped query; returns no row for all inaccessible reports. */
  listEntitledReports(
    principalId: string,
    now: Date,
  ): Promise<readonly EntitledPrivateReportRecord[]>;
  /** One owner/entitlement/order-scoped query; wrong-owner and unknown IDs are indistinguishable. */
  findEntitledReport(
    principalId: string,
    reportId: string,
    now: Date,
  ): Promise<EntitledPrivateReportRecord | null>;
  /** Inserts an accepted receipt or returns the durable replay; null means inaccessible target. */
  createLifecycleRequest(input: {
    readonly id: string;
    readonly principalId: string;
    readonly reportId: string;
    readonly action: PrivateLifecycleAction;
    readonly idempotencyKey: string;
    readonly requestFingerprint: string;
    readonly correlationId: string;
    readonly auditEventId: string;
    readonly now: Date;
  }): Promise<PrivateLifecycleRequestReceipt | null>;
  /** Revokes active sessions and appends its success audit in one transaction. */
  revokeAllSessions(input: {
    readonly principalId: string;
    readonly now: Date;
    readonly correlationId: string;
    readonly auditEventId: string;
  }): Promise<number>;
  appendAudit(event: PrivateAuditEventInput): Promise<void>;
}

export class PrivateAccessNotFoundError extends Error {
  public constructor() {
    super("REPORT_NOT_FOUND");
    this.name = "PrivateAccessNotFoundError";
  }
}

export class PrivateAccessIdempotencyConflictError extends Error {
  public constructor() {
    super("IDEMPOTENCY_KEY_CONFLICT");
    this.name = "PrivateAccessIdempotencyConflictError";
  }
}

export class PrivateAccessReauthenticationRequiredError extends Error {
  public constructor() {
    super("REAUTHENTICATION_REQUIRED");
    this.name = "PrivateAccessReauthenticationRequiredError";
  }
}

export interface AccountReportSummary {
  readonly id: string;
  readonly title: string;
  readonly locale: "en-IN" | "hi-IN" | "or-IN";
  readonly status: "ready";
  readonly readyAt: string;
}

export interface PrivateAccessService {
  listAccount(session: AuthenticatedSession): Promise<readonly AccountReportSummary[]>;
  getReport(
    session: AuthenticatedSession,
    reportId: string,
  ): Promise<CustomerDeliveryProjection | null>;
  requestLifecycle(input: {
    readonly session: AuthenticatedSession;
    readonly reportId: string;
    readonly action: PrivateLifecycleAction;
    readonly idempotencyKey: string;
    readonly correlationId: string;
    readonly recentAuth: boolean;
    readonly now: Date;
  }): Promise<PrivateLifecycleRequestReceipt>;
}

const ACTION = z.enum(["correction", "export", "deletion"]);
const LIFECYCLE_BODY = z.strictObject({ action: ACTION });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CORRELATION = /^[A-Za-z0-9._:-]{1,64}$/u;
const MAX_BODY_BYTES = 4_096;
const EMPTY_TARGET = "00000000-0000-4000-8000-000000000000";

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  const responseHeaders = new Headers({
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow",
    ...headers,
  });
  return new Response(JSON.stringify(body), { headers: responseHeaders, status });
}

function problem(status: number, code: string, correlationId: string): Response {
  return json(
    status,
    {
      code,
      correlationId: CORRELATION.test(correlationId) ? correlationId : "unavailable",
      status,
      title: "Request could not be completed.",
      type: `https://numerology.example/problems/${code}`,
    },
    { "Content-Type": "application/problem+json" },
  );
}

async function readJson(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json") {
    throw new RangeError("REQUEST_INVALID");
  }
  if (request.body === null) throw new RangeError("REQUEST_INVALID");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new RangeError("REQUEST_INVALID");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new RangeError("REQUEST_INVALID");
  }
}

function asJson(value: string, purpose: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`PRIVATE_${purpose}_INVALID`);
  }
}

function targetId(reportId: string): string {
  return UUID.test(reportId) ? reportId : EMPTY_TARGET;
}

function safeCorrelation(
  dependencies: { correlationId?: (request: Request) => string },
  request: Request,
) {
  const candidate = dependencies.correlationId?.(request) ?? randomUUID();
  return UUID.test(candidate) ? candidate.toLowerCase() : randomUUID();
}

/** Application module for private account/report delivery and lifecycle receipts. */
export function createPrivateAccessService(dependencies: {
  readonly access: PrivateAccessRepository;
  readonly clock: Clock;
  readonly protector: FieldProtector;
  readonly idGenerator?: IdGenerator;
}): PrivateAccessService {
  const ids = dependencies.idGenerator ?? { next: () => randomUUID() };

  async function revealReport(record: EntitledPrivateReportRecord): Promise<{
    readonly projection: CustomerDeliveryProjection;
    readonly title: string;
  }> {
    const structured = asJson(
      await dependencies.protector.reveal(
        record.structuredReportCiphertext,
        "structured_report_snapshot",
      ),
      "STRUCTURED_REPORT",
    );
    const report = parseStructuredReport(structured);
    const calculation = asJson(
      await dependencies.protector.reveal(
        record.calculationSnapshotCiphertext,
        "report_calculation_snapshot",
      ),
      "CALCULATION_SNAPSHOT",
    );
    return {
      projection: projectCustomerDelivery(report, calculation, record.verificationJson),
      title: report.title,
    };
  }

  return {
    async listAccount(session) {
      const records = await dependencies.access.listEntitledReports(
        session.principalId,
        dependencies.clock.now(),
      );
      const summaries: AccountReportSummary[] = [];
      for (const record of records) {
        const revealed = await revealReport(record);
        summaries.push({
          id: record.id,
          locale: record.locale,
          readyAt: record.readyAt.toISOString(),
          status: record.status,
          title: revealed.title,
        });
      }
      return summaries;
    },

    async getReport(session, reportId) {
      if (!UUID.test(reportId)) return null;
      const record = await dependencies.access.findEntitledReport(
        session.principalId,
        reportId,
        dependencies.clock.now(),
      );
      if (record === null) return null;
      return (await revealReport(record)).projection;
    },

    async requestLifecycle(input) {
      if (!UUID.test(input.reportId)) throw new PrivateAccessNotFoundError();
      if ((input.action === "export" || input.action === "deletion") && !input.recentAuth) {
        throw new PrivateAccessReauthenticationRequiredError();
      }
      if (!UUID.test(input.idempotencyKey)) throw new RangeError("IDEMPOTENCY_KEY_REQUIRED");
      const receipt = await dependencies.access.createLifecycleRequest({
        action: input.action,
        auditEventId: ids.next(),
        correlationId: input.correlationId,
        id: ids.next(),
        idempotencyKey: input.idempotencyKey.toLowerCase(),
        now: input.now,
        principalId: input.session.principalId,
        reportId: input.reportId.toLowerCase(),
        requestFingerprint: canonicalHash({
          action: input.action,
          reportId: input.reportId.toLowerCase(),
        }),
      });
      if (receipt === null) throw new PrivateAccessNotFoundError();
      return receipt;
    },
  };
}

export interface PrivateAccessHttpHandlers {
  readonly account: (request: Request) => Promise<Response>;
  readonly report: (request: Request, reportId: string) => Promise<Response>;
  readonly lifecycle: (request: Request, reportId: string) => Promise<Response>;
  readonly signedPdf: (request: Request, reportId: string) => Promise<Response>;
  readonly revokeAll: (request: Request) => Promise<Response>;
}

/** Framework-independent HTTP seam for Next route adapters and integration tests. */
export function createPrivateAccessHttpHandlers(dependencies: {
  readonly access: PrivateAccessRepository;
  readonly clock: Clock;
  readonly origin: string;
  readonly protector: FieldProtector;
  readonly sessions: SessionRepository;
  readonly correlationId?: (request: Request) => string;
  readonly idGenerator?: IdGenerator;
  readonly recentAuthWindowMs?: number;
}): PrivateAccessHttpHandlers {
  const authentication: SessionAuthentication = createSessionAuthentication(dependencies);
  const service = createPrivateAccessService(dependencies);

  async function audit(
    request: Request,
    input: Omit<PrivateAuditEventInput, "id" | "correlationId" | "occurredAt"> & {
      readonly correlationId: string;
      readonly occurredAt: Date;
    },
  ): Promise<void> {
    await dependencies.access.appendAudit({
      ...input,
      correlationId: input.correlationId,
      id: (dependencies.idGenerator ?? { next: () => randomUUID() }).next(),
      occurredAt: input.occurredAt,
    });
    void request;
  }

  async function context(request: Request) {
    return authentication.read(request);
  }

  function method(request: Request, expected: string, correlationId: string): Response | null {
    return request.method === expected ? null : problem(405, "METHOD_NOT_ALLOWED", correlationId);
  }

  return {
    async account(request) {
      const correlationId = safeCorrelation(dependencies, request);
      const wrongMethod = method(request, "GET", correlationId);
      if (wrongMethod) return wrongMethod;
      try {
        const auth = await context(request);
        if (auth.session === null) {
          await audit(request, {
            action: "private.account.denied",
            actorType: "system",
            correlationId,
            reasonCode: "UNAUTHENTICATED",
            safeMetadata: { outcome: "denied" },
            targetId: EMPTY_TARGET,
            targetType: "account",
            occurredAt: dependencies.clock.now(),
          });
          return problem(401, "UNAUTHENTICATED", correlationId);
        }
        const reports = await service.listAccount(auth.session);
        await audit(request, {
          action: "private.account.read",
          actorPrincipalId: auth.session.principalId,
          actorType: "principal",
          correlationId,
          safeMetadata: { count: reports.length, outcome: "success" },
          targetId: auth.session.principalId,
          targetType: "account",
          occurredAt: dependencies.clock.now(),
        });
        return json(200, { reports });
      } catch {
        return problem(503, "PRIVATE_ACCESS_UNAVAILABLE", correlationId);
      }
    },

    async report(request, reportId) {
      const correlationId = safeCorrelation(dependencies, request);
      const wrongMethod = method(request, "GET", correlationId);
      if (wrongMethod) return wrongMethod;
      try {
        const auth = await context(request);
        if (auth.session === null) {
          await audit(request, {
            action: "private.report.denied",
            actorType: "system",
            correlationId,
            reasonCode: "UNAUTHENTICATED",
            safeMetadata: { outcome: "denied" },
            targetId: targetId(reportId),
            targetType: "report",
            occurredAt: dependencies.clock.now(),
          });
          return problem(401, "UNAUTHENTICATED", correlationId);
        }
        const projection = await service.getReport(auth.session, reportId);
        if (projection === null) {
          await audit(request, {
            action: "private.report.denied",
            actorPrincipalId: auth.session.principalId,
            actorType: "principal",
            correlationId,
            reasonCode: "REPORT_NOT_FOUND",
            safeMetadata: { outcome: "denied" },
            targetId: targetId(reportId),
            targetType: "report",
            occurredAt: dependencies.clock.now(),
          });
          return problem(404, "REPORT_NOT_FOUND", correlationId);
        }
        await audit(request, {
          action: "private.report.read",
          actorPrincipalId: auth.session.principalId,
          actorType: "principal",
          correlationId,
          safeMetadata: { outcome: "success" },
          targetId: targetId(reportId),
          targetType: "report",
          occurredAt: dependencies.clock.now(),
        });
        return json(200, projection);
      } catch {
        return problem(503, "PRIVATE_ACCESS_UNAVAILABLE", correlationId);
      }
    },

    async lifecycle(request, reportId) {
      const correlationId = safeCorrelation(dependencies, request);
      const wrongMethod = method(request, "POST", correlationId);
      if (wrongMethod) return wrongMethod;
      let auth: Awaited<ReturnType<typeof context>> | undefined;
      try {
        auth = await context(request);
        if (auth.session === null) {
          await audit(request, {
            action: "private.request.denied",
            actorType: "system",
            correlationId,
            reasonCode: "UNAUTHENTICATED",
            safeMetadata: { outcome: "denied" },
            targetId: targetId(reportId),
            targetType: "report",
            occurredAt: dependencies.clock.now(),
          });
          return problem(401, "UNAUTHENTICATED", correlationId);
        }
        if (!auth.csrfValid) {
          await audit(request, {
            action: "private.request.denied",
            actorPrincipalId: auth.session.principalId,
            actorType: "principal",
            correlationId,
            reasonCode: "CSRF_REQUIRED",
            safeMetadata: { outcome: "denied" },
            targetId: targetId(reportId),
            targetType: "report",
            occurredAt: dependencies.clock.now(),
          });
          return problem(403, "CSRF_REQUIRED", correlationId);
        }
        if (!UUID.test(reportId)) {
          await audit(request, {
            action: "private.request.denied",
            actorPrincipalId: auth.session.principalId,
            actorType: "principal",
            correlationId,
            reasonCode: "REPORT_NOT_FOUND",
            safeMetadata: { outcome: "denied" },
            targetId: EMPTY_TARGET,
            targetType: "report",
            occurredAt: dependencies.clock.now(),
          });
          return problem(404, "REPORT_NOT_FOUND", correlationId);
        }
        const key = request.headers.get("idempotency-key") ?? "";
        if (!UUID.test(key)) {
          await audit(request, {
            action: "private.request.denied",
            actorPrincipalId: auth.session.principalId,
            actorType: "principal",
            correlationId,
            reasonCode: "IDEMPOTENCY_KEY_REQUIRED",
            safeMetadata: { outcome: "denied" },
            targetId: targetId(reportId),
            targetType: "report",
            occurredAt: dependencies.clock.now(),
          });
          return problem(400, "IDEMPOTENCY_KEY_REQUIRED", correlationId);
        }
        const parsed = LIFECYCLE_BODY.parse(await readJson(request));
        const now = dependencies.clock.now();
        const receipt = await service.requestLifecycle({
          action: parsed.action,
          correlationId,
          idempotencyKey: key,
          now,
          recentAuth: auth.recentAuth,
          reportId,
          session: auth.session,
        });
        return json(202, {
          action: receipt.action,
          id: receipt.id,
          requestedAt: receipt.requestedAt.toISOString(),
          status: receipt.status,
        });
      } catch (error) {
        if (error instanceof PrivateAccessReauthenticationRequiredError)
          return (async () => {
            if (auth?.session !== null && auth?.session !== undefined) {
              try {
                await audit(request, {
                  action: "private.request.denied",
                  actorPrincipalId: auth.session.principalId,
                  actorType: "principal",
                  correlationId,
                  reasonCode: "REAUTHENTICATION_REQUIRED",
                  safeMetadata: { outcome: "denied" },
                  targetId: targetId(reportId),
                  targetType: "report",
                  occurredAt: dependencies.clock.now(),
                });
              } catch {
                return problem(503, "PRIVATE_ACCESS_UNAVAILABLE", correlationId);
              }
            }
            return problem(401, "REAUTHENTICATION_REQUIRED", correlationId);
          })();
        if (error instanceof PrivateAccessNotFoundError) {
          return problem(404, "REPORT_NOT_FOUND", correlationId);
        }
        if (error instanceof PrivateAccessIdempotencyConflictError)
          return problem(409, "IDEMPOTENCY_KEY_CONFLICT", correlationId);
        if (error instanceof z.ZodError || error instanceof RangeError) {
          if (auth?.session !== null && auth?.session !== undefined) {
            try {
              await audit(request, {
                action: "private.request.denied",
                actorPrincipalId: auth.session.principalId,
                actorType: "principal",
                correlationId,
                reasonCode: "REQUEST_INVALID",
                safeMetadata: { outcome: "denied" },
                targetId: targetId(reportId),
                targetType: "report",
                occurredAt: dependencies.clock.now(),
              });
            } catch {
              return problem(503, "PRIVATE_ACCESS_UNAVAILABLE", correlationId);
            }
          }
          return problem(400, "REQUEST_INVALID", correlationId);
        }
        return problem(503, "PRIVATE_ACCESS_UNAVAILABLE", correlationId);
      }
    },

    async signedPdf(request, reportId) {
      const correlationId = safeCorrelation(dependencies, request);
      const wrongMethod = method(request, "POST", correlationId);
      if (wrongMethod) return wrongMethod;
      try {
        const auth = await context(request);
        if (auth.session === null) {
          await audit(request, {
            action: "private.report.signed_pdf.denied",
            actorType: "system",
            correlationId,
            reasonCode: "UNAUTHENTICATED",
            safeMetadata: { outcome: "denied" },
            targetId: targetId(reportId),
            targetType: "report",
            occurredAt: dependencies.clock.now(),
          });
          return problem(401, "UNAUTHENTICATED", correlationId);
        }
        if (!auth.csrfValid) {
          await audit(request, {
            action: "private.report.signed_pdf.denied",
            actorPrincipalId: auth.session.principalId,
            actorType: "principal",
            correlationId,
            reasonCode: "CSRF_REQUIRED",
            safeMetadata: { outcome: "denied" },
            targetId: targetId(reportId),
            targetType: "report",
            occurredAt: dependencies.clock.now(),
          });
          return problem(403, "CSRF_REQUIRED", correlationId);
        }
        if (
          !UUID.test(reportId) ||
          (await dependencies.access.findEntitledReport(
            auth.session.principalId,
            reportId,
            dependencies.clock.now(),
          )) === null
        ) {
          await audit(request, {
            action: "private.report.signed_pdf.denied",
            actorPrincipalId: auth.session.principalId,
            actorType: "principal",
            correlationId,
            reasonCode: "REPORT_NOT_FOUND",
            safeMetadata: { outcome: "denied" },
            targetId: targetId(reportId),
            targetType: "report",
            occurredAt: dependencies.clock.now(),
          });
          return problem(404, "REPORT_NOT_FOUND", correlationId);
        }
        await audit(request, {
          action: "private.report.signed_pdf.unavailable",
          actorPrincipalId: auth.session.principalId,
          actorType: "principal",
          correlationId,
          reasonCode: "SIGNED_PDF_UNAVAILABLE",
          safeMetadata: { outcome: "unavailable" },
          targetId: targetId(reportId),
          targetType: "report",
          occurredAt: dependencies.clock.now(),
        });
        return problem(501, "SIGNED_PDF_UNAVAILABLE", correlationId);
      } catch {
        return problem(503, "PRIVATE_ACCESS_UNAVAILABLE", correlationId);
      }
    },

    async revokeAll(request) {
      const correlationId = safeCorrelation(dependencies, request);
      const wrongMethod = method(request, "POST", correlationId);
      if (wrongMethod) return wrongMethod;
      try {
        const auth = await context(request);
        if (auth.session === null) {
          await audit(request, {
            action: "private.sessions.revoke_all.denied",
            actorType: "system",
            correlationId,
            reasonCode: "UNAUTHENTICATED",
            safeMetadata: { outcome: "denied" },
            targetId: EMPTY_TARGET,
            targetType: "session",
            occurredAt: dependencies.clock.now(),
          });
          return problem(401, "UNAUTHENTICATED", correlationId);
        }
        if (!auth.csrfValid) {
          await audit(request, {
            action: "private.sessions.revoke_all.denied",
            actorPrincipalId: auth.session.principalId,
            actorType: "principal",
            correlationId,
            reasonCode: "CSRF_REQUIRED",
            safeMetadata: { outcome: "denied" },
            targetId: EMPTY_TARGET,
            targetType: "session",
            occurredAt: dependencies.clock.now(),
          });
          return problem(403, "CSRF_REQUIRED", correlationId);
        }
        if (!auth.recentAuth) {
          await audit(request, {
            action: "private.sessions.revoke_all.denied",
            actorPrincipalId: auth.session.principalId,
            actorType: "principal",
            correlationId,
            reasonCode: "REAUTHENTICATION_REQUIRED",
            safeMetadata: { outcome: "denied" },
            targetId: EMPTY_TARGET,
            targetType: "session",
            occurredAt: dependencies.clock.now(),
          });
          return problem(401, "REAUTHENTICATION_REQUIRED", correlationId);
        }
        const now = dependencies.clock.now();
        await dependencies.access.revokeAllSessions({
          auditEventId: (dependencies.idGenerator ?? { next: () => randomUUID() }).next(),
          correlationId,
          now,
          principalId: auth.session.principalId,
        });
        const headers = new Headers({
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
          "X-Robots-Tag": "noindex, nofollow",
        });
        headers.append(
          "Set-Cookie",
          `${PRIVATE_SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
        );
        headers.append(
          "Set-Cookie",
          `${PRIVATE_CSRF_COOKIE}=; Path=/; Secure; SameSite=Strict; Max-Age=0`,
        );
        headers.append(
          "Set-Cookie",
          `report_draft=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
        );
        return new Response(null, { headers, status: 204 });
      } catch {
        return problem(503, "PRIVATE_ACCESS_UNAVAILABLE", correlationId);
      }
    },
  };
}

/** Short aliases used by framework adapters. */
export const createPrivateAccessHandlers = createPrivateAccessHttpHandlers;
