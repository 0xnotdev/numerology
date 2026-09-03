import { reportIntentInputSchema, reportIntentPatchSchema } from "@numerology/contracts";
import { canonicalHash } from "@numerology/engine";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { Clock } from "./clock";
import { createDraftCookie, type DraftCookiePayload, verifyDraftCookie } from "./draft-cookie";
import type {
  CompleteReportIntentCommandInput,
  CreateReportIntentCommandInput,
  OwnedIntentInput,
  PatchReportIntentCommandInput,
  PreviewReportIntentCommandInput,
  ReportIntentCommandDependencies,
  ReportPreview,
} from "./report-intent-commands";
import { createReportIntentCommands } from "./report-intent-commands";
import type { ReportIntentRecord } from "./report-intent-repository";
import { OptimisticConcurrencyError, ReportIntentNotFoundError } from "./report-intent-repository";

const createBodySchema = z.strictObject({ locale: z.enum(["en-IN", "hi-IN", "or-IN"]) });
const patchBodySchema = z.strictObject({
  expectedVersion: z.number().int().positive(),
  patch: z.unknown(),
});
const completeBodySchema = z.strictObject({ input: z.unknown() });
const emptyBodySchema = z.strictObject({});
const MAX_BODY_BYTES = 256 * 1024;
const IDEMPOTENCY_WINDOW_MS = 24 * 60 * 60 * 1_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export interface CreateIdempotencyRequest {
  readonly expiresAt: Date;
  readonly key: string;
  readonly operation: "report-intents.create";
  readonly ownerPrincipalId: string;
  /** Stable opaque intent id used to reconcile a committed create after a response-write crash. */
  readonly resourceId: string;
  readonly requestFingerprint: string;
}

export class IdempotencyConflictError extends Error {
  public constructor() {
    super("IDEMPOTENCY_KEY_CONFLICT");
    this.name = "IdempotencyConflictError";
  }
}

export class IdempotencyInProgressError extends Error {
  public constructor() {
    super("IDEMPOTENCY_REQUEST_IN_PROGRESS");
    this.name = "IdempotencyInProgressError";
  }
}

export interface ReportIntentHttpDependencies {
  readonly clock: Clock;
  readonly commands: ReturnType<typeof createReportIntentCommands>;
  /**
   * Trusted server-side session/principal boundary used only for creating a new intent. The
   * composition must derive this from an authenticated session, never from an ambient browser
   * cookie or request body; create still requires CSRF as defense in depth.
   */
  readonly createOwnerPrincipalId: (request: Request) => string | null;
  /** Resolves ownership only after the signed draft cookie has been verified. */
  readonly ownerPrincipalId: (
    request: Request,
    verifiedCookie: DraftCookiePayload,
  ) => string | null;
  readonly createSubjectId: (ownerPrincipalId: string) => string;
  readonly readCsrf: (request: Request) => boolean;
  readonly rateLimiter: {
    consume(
      key: string,
      limit: number,
      windowMs: number,
    ): { allowed: boolean; remaining: number; retryAfterSeconds: number };
  };
  readonly draftCookieSecret: string;
  /** Explicit deployment policy: production composition must set this to true. */
  readonly cookieSecure: boolean;
  /** Correlation identifiers come from the application boundary, never from PII-bearing input. */
  readonly correlationId: (request: Request) => string;
  /** Durable composition supplies this; tests/local may use a bounded adapter. */
  readonly createIdempotency: {
    execute(
      request: CreateIdempotencyRequest,
      operation: () => Promise<{ body: unknown; cookie: string }>,
      reconcile?: () => Promise<{ body: unknown; cookie: string } | null>,
    ): Promise<{ body: unknown; cookie: string }>;
  };
}

export interface ReportIntentHttpHandlers {
  readonly create: (request: Request) => Promise<Response>;
  readonly get: (request: Request, id: string) => Promise<Response>;
  readonly patch: (request: Request, id: string) => Promise<Response>;
  readonly complete: (request: Request, id: string) => Promise<Response>;
  readonly preview: (request: Request, id: string) => Promise<Response>;
}

function noStoreHeaders(contentType = "application/json"): Headers {
  return new Headers({ "Cache-Control": "no-store", "Content-Type": contentType });
}

function json(status: number, body: unknown, extraHeaders: Record<string, string> = {}): Response {
  const headers = noStoreHeaders();
  for (const [key, value] of Object.entries(extraHeaders)) headers.set(key, value);
  return new Response(JSON.stringify(body), { headers, status });
}

function problem(
  status: number,
  code: string,
  dependencies: ReportIntentHttpDependencies,
  request: Request,
  fieldErrors: readonly { field: string; code: string }[] = [],
  extraHeaders: Record<string, string> = {},
): Response {
  const headers = noStoreHeaders("application/problem+json");
  for (const [key, value] of Object.entries(extraHeaders)) headers.set(key, value);
  const suppliedCorrelationId = dependencies.correlationId(request);
  const safeCorrelationId = /^[A-Za-z0-9._:-]{1,128}$/u.test(suppliedCorrelationId)
    ? suppliedCorrelationId
    : "unavailable";
  return new Response(
    JSON.stringify({
      code,
      correlationId: safeCorrelationId,
      ...(fieldErrors.length === 0 ? {} : { fieldErrors }),
      status,
      title: "Request could not be completed.",
      type: `https://numerology.example/problems/${code}`,
    }),
    { headers, status },
  );
}

function safeRecord(record: ReportIntentRecord) {
  return {
    expiresAt: record.expiresAt.toISOString(),
    id: record.id,
    locale: record.locale,
    status: record.status,
    updatedAt: record.updatedAt.toISOString(),
    version: record.version,
  };
}

function cookieHeader(
  payload: DraftCookiePayload,
  secret: string,
  now: Date,
  secure: boolean,
): string {
  return `report_draft=${createDraftCookie(payload, secret, now)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${secure ? "; Secure" : ""}`;
}

function ownerInput(
  dependencies: ReportIntentHttpDependencies,
  request: Request,
  id: string,
): OwnedIntentInput | string {
  const cookie = readVerifiedDraftCookie(dependencies, request);
  if (cookie === null || cookie.intentId !== id) return "UNAUTHENTICATED";
  const ownerPrincipalId = dependencies.ownerPrincipalId(request, cookie);
  if (ownerPrincipalId === null || ownerPrincipalId.trim().length === 0) return "UNAUTHENTICATED";
  return { id, ownerPrincipalId };
}

function readRequestCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (header === null) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    if (part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim();
  }
  return null;
}

function readVerifiedDraftCookie(
  dependencies: ReportIntentHttpDependencies,
  request: Request,
): DraftCookiePayload | null {
  const raw = readRequestCookie(request, "report_draft");
  return raw === null
    ? null
    : verifyDraftCookie(raw, dependencies.draftCookieSecret, dependencies.clock.now());
}

async function requestJson(request: Request): Promise<unknown> {
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/u.test(length) || Number(length) > MAX_BODY_BYTES)) {
    throw new RangeError("REQUEST_BODY_TOO_LARGE");
  }
  try {
    const body = await request.json();
    if (JSON.stringify(body).length > MAX_BODY_BYTES)
      throw new RangeError("REQUEST_BODY_TOO_LARGE");
    return body;
  } catch (error) {
    if (error instanceof RangeError && error.message === "REQUEST_BODY_TOO_LARGE") throw error;
    throw new RangeError("REQUEST_BODY_INVALID");
  }
}

function rateCheck(
  dependencies: ReportIntentHttpDependencies,
  request: Request,
  owner: string,
  operation: string,
): Response | null {
  const decision = dependencies.rateLimiter.consume(
    `${owner}:${operation}`,
    operation === "create" ? 5 : 30,
    60_000,
  );
  return decision.allowed
    ? null
    : problem(429, "RATE_LIMITED", dependencies, request, [], {
        "Retry-After": String(decision.retryAfterSeconds),
      });
}

function safeFieldErrors(error: z.ZodError): readonly { field: string; code: string }[] {
  return error.issues.map((issue) => ({
    code: issue.code,
    field:
      issue.path.length === 0 ||
      issue.path.some((part) => !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(String(part)))
        ? "body"
        : issue.path.map(String).join("."),
  }));
}

function handleError(
  error: unknown,
  dependencies: ReportIntentHttpDependencies,
  request: Request,
): Response {
  if (error instanceof ReportIntentNotFoundError)
    return problem(404, "REPORT_INTENT_NOT_FOUND", dependencies, request);
  if (error instanceof OptimisticConcurrencyError)
    return problem(409, "INTENT_VERSION_CONFLICT", dependencies, request);
  if (error instanceof IdempotencyConflictError)
    return problem(409, "IDEMPOTENCY_KEY_CONFLICT", dependencies, request);
  if (error instanceof IdempotencyInProgressError)
    return problem(409, "IDEMPOTENCY_REQUEST_IN_PROGRESS", dependencies, request);
  if (error instanceof RangeError) {
    const candidate = error.message.split(":")[0] ?? "REQUEST_INVALID";
    const code = /^[A-Z][A-Z0-9_]{1,80}$/u.test(candidate) ? candidate : "REQUEST_INVALID";
    return problem(400, code, dependencies, request);
  }
  if (error instanceof z.ZodError)
    return problem(400, "REQUEST_INVALID", dependencies, request, safeFieldErrors(error));
  return problem(500, "REQUEST_FAILED", dependencies, request);
}

function requireCsrf(
  dependencies: ReportIntentHttpDependencies,
  request: Request,
): Response | null {
  return dependencies.readCsrf(request)
    ? null
    : problem(403, "CSRF_REQUIRED", dependencies, request);
}

function readIdempotencyKey(request: Request): string {
  const value = request.headers.get("idempotency-key");
  if (value === null || !UUID_PATTERN.test(value)) {
    throw new RangeError("IDEMPOTENCY_KEY_REQUIRED");
  }
  return value;
}

function deterministicCreateResourceId(ownerPrincipalId: string, idempotencyKey: string): string {
  const hex = createHash("sha256")
    .update("numerology:report-intent:create:v1:", "utf8")
    .update(ownerPrincipalId, "utf8")
    .update("\0", "utf8")
    .update(idempotencyKey, "utf8")
    .digest("hex")
    .slice(0, 32)
    .split("");
  hex[12] = "5";
  hex[16] = ((Number.parseInt(hex[16] ?? "0", 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
}

function refreshedCookie(
  dependencies: ReportIntentHttpDependencies,
  record: ReportIntentRecord,
): string {
  return cookieHeader(
    {
      expiresAt: record.expiresAt.toISOString(),
      intentId: record.id,
    },
    dependencies.draftCookieSecret,
    dependencies.clock.now(),
    dependencies.cookieSecure,
  );
}

/** Framework-independent strict adapters for Next route handlers and integration tests. */
export function createReportIntentHttpHandlers(
  dependencies: ReportIntentHttpDependencies,
): ReportIntentHttpHandlers {
  const commands = dependencies.commands;
  return {
    async create(request) {
      try {
        const owner = dependencies.createOwnerPrincipalId(request);
        if (owner === null || owner.trim().length === 0)
          return problem(401, "UNAUTHENTICATED", dependencies, request);
        const csrf = requireCsrf(dependencies, request);
        if (csrf) return csrf;
        const limited = rateCheck(dependencies, request, owner, "create");
        if (limited) return limited;
        const idempotencyKey = readIdempotencyKey(request);
        const body = createBodySchema.parse(await requestJson(request));
        const now = dependencies.clock.now();
        const resourceId = deterministicCreateResourceId(owner, idempotencyKey);
        const idempotent = await dependencies.createIdempotency.execute(
          {
            expiresAt: new Date(now.valueOf() + IDEMPOTENCY_WINDOW_MS),
            key: idempotencyKey,
            operation: "report-intents.create",
            ownerPrincipalId: owner,
            resourceId,
            requestFingerprint: canonicalHash(body),
          },
          async () => {
            const commandInput: CreateReportIntentCommandInput = {
              id: resourceId,
              locale: body.locale,
              ownerPrincipalId: owner,
              subjectId: dependencies.createSubjectId(owner),
            };
            const result = await commands.create(commandInput);
            return {
              body: { draft: result.draft, intent: safeRecord(result.record) },
              cookie: refreshedCookie(dependencies, result.record),
            };
          },
          async () => {
            try {
              const result = await commands.get({ id: resourceId, ownerPrincipalId: owner });
              return {
                body: { draft: result.draft, intent: safeRecord(result.record) },
                cookie: refreshedCookie(dependencies, result.record),
              };
            } catch (error) {
              if (error instanceof ReportIntentNotFoundError) return null;
              throw error;
            }
          },
        );
        return json(201, idempotent.body, { "Set-Cookie": idempotent.cookie });
      } catch (error) {
        return handleError(error, dependencies, request);
      }
    },

    async get(request, id) {
      try {
        const owner = ownerInput(dependencies, request, id);
        if (typeof owner === "string")
          return problem(401, "UNAUTHENTICATED", dependencies, request);
        const limited = rateCheck(dependencies, request, owner.ownerPrincipalId, "get");
        if (limited) return limited;
        const result = await commands.get(owner);
        return json(
          200,
          { draft: result.draft, intent: safeRecord(result.record) },
          {
            "Set-Cookie": refreshedCookie(dependencies, result.record),
          },
        );
      } catch (error) {
        return handleError(error, dependencies, request);
      }
    },

    async patch(request, id) {
      try {
        const owner = ownerInput(dependencies, request, id);
        if (typeof owner === "string")
          return problem(401, "UNAUTHENTICATED", dependencies, request);
        const csrf = requireCsrf(dependencies, request);
        if (csrf) return csrf;
        const limited = rateCheck(dependencies, request, owner.ownerPrincipalId, "patch");
        if (limited) return limited;
        const body = patchBodySchema.parse(await requestJson(request));
        const patch = reportIntentPatchSchema.parse(body.patch);
        const result = await commands.patch({
          ...owner,
          expectedVersion: body.expectedVersion,
          patch,
        } satisfies PatchReportIntentCommandInput);
        return json(
          200,
          { draft: result.draft, intent: safeRecord(result.record) },
          {
            "Set-Cookie": refreshedCookie(dependencies, result.record),
          },
        );
      } catch (error) {
        return handleError(error, dependencies, request);
      }
    },

    async complete(request, id) {
      try {
        const owner = ownerInput(dependencies, request, id);
        if (typeof owner === "string")
          return problem(401, "UNAUTHENTICATED", dependencies, request);
        const csrf = requireCsrf(dependencies, request);
        if (csrf) return csrf;
        const limited = rateCheck(dependencies, request, owner.ownerPrincipalId, "complete");
        if (limited) return limited;
        const body = completeBodySchema.parse(await requestJson(request));
        const completeInput = reportIntentInputSchema.parse(body.input);
        const result = await commands.complete({
          ...owner,
          input: completeInput,
        } satisfies CompleteReportIntentCommandInput);
        return json(
          200,
          { draft: result.draft, intent: safeRecord(result.record) },
          {
            "Set-Cookie": refreshedCookie(dependencies, result.record),
          },
        );
      } catch (error) {
        return handleError(error, dependencies, request);
      }
    },

    async preview(request, id) {
      try {
        const owner = ownerInput(dependencies, request, id);
        if (typeof owner === "string")
          return problem(401, "UNAUTHENTICATED", dependencies, request);
        const limited = rateCheck(dependencies, request, owner.ownerPrincipalId, "preview");
        if (limited) return limited;
        const body = emptyBodySchema.parse(request.body === null ? {} : await requestJson(request));
        void body;
        const preview: ReportPreview = await commands.preview(
          owner satisfies PreviewReportIntentCommandInput,
        );
        const current = await commands.get(owner);
        return json(200, preview, { "Set-Cookie": refreshedCookie(dependencies, current.record) });
      } catch (error) {
        return handleError(error, dependencies, request);
      }
    },
  };
}

/** Stable name for thin framework route adapters; all policy remains in this port-boundary module. */
export const createReportIntentRouteHandlers = createReportIntentHttpHandlers;

export function createDefaultReportIntentHttpDependencies(
  dependencies: ReportIntentCommandDependencies &
    Pick<
      ReportIntentHttpDependencies,
      | "createOwnerPrincipalId"
      | "createSubjectId"
      | "ownerPrincipalId"
      | "readCsrf"
      | "rateLimiter"
      | "draftCookieSecret"
      | "cookieSecure"
      | "correlationId"
      | "createIdempotency"
    >,
): ReportIntentHttpDependencies {
  return {
    ...dependencies,
    clock: dependencies.clock,
    commands: createReportIntentCommands(dependencies),
  };
}
