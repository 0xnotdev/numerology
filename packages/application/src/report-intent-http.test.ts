import { describe, expect, it, vi } from "vitest";
import { createDraftCookie, type DraftCookiePayload } from "./draft-cookie";
import type { ReportIntentHttpDependencies } from "./report-intent-http";
import { createReportIntentHttpHandlers, IdempotencyConflictError } from "./report-intent-http";
import { OptimisticConcurrencyError } from "./report-intent-repository";

const record = {
  createdAt: new Date("2026-09-03T00:00:00.000Z"),
  draftCiphertext: new Uint8Array([1]),
  expiresAt: new Date("2026-09-10T00:00:00.000Z"),
  id: "00000000-0000-4000-8000-000000000003",
  inputHash: null,
  inputSchemaVersion: "1.0.0",
  inputSnapshotCiphertext: null,
  locale: "en-IN" as const,
  noticeVersion: null,
  ownerPrincipalId: "opaque-owner",
  requiredConsentAt: null,
  status: "draft" as const,
  subjectId: "00000000-0000-4000-8000-000000000002",
  updatedAt: new Date("2026-09-03T00:00:00.000Z"),
  version: 1,
};

function deps(isAuthenticated = true): ReportIntentHttpDependencies {
  const idempotentResponses = new Map<
    string,
    { fingerprint: string; response: { body: unknown; cookie: string } }
  >();
  return {
    clock: { now: () => new Date("2026-09-03T00:00:00.000Z") },
    commands: {
      complete: vi.fn(),
      create: vi.fn(async () => ({ draft: { locale: "en-IN", schemaVersion: "1.0.0" }, record })),
      get: vi.fn(async () => ({ draft: { locale: "en-IN", schemaVersion: "1.0.0" }, record })),
      patch: vi.fn(async () => ({ draft: { locale: "en-IN", schemaVersion: "1.0.0" }, record })),
      preview: vi.fn(async () => ({
        locale: "en-IN",
        values: [{ label: "Life path", value: "7" }],
      })),
    } as unknown as ReportIntentHttpDependencies["commands"],
    createSubjectId: () => record.subjectId,
    createOwnerPrincipalId: () => (isAuthenticated ? "opaque-owner" : null),
    ownerPrincipalId: (_request, verifiedCookie) =>
      isAuthenticated && verifiedCookie.intentId === record.id ? "opaque-owner" : null,
    readCsrf: (request) => request.headers.get("x-csrf-token") === "valid-csrf",
    rateLimiter: { consume: () => ({ allowed: true, remaining: 10, retryAfterSeconds: 0 }) },
    draftCookieSecret: "test-secret-that-is-long-enough",
    cookieSecure: false,
    correlationId: () => "corr-test-001",
    createIdempotency: {
      async execute(idempotency, operation) {
        const mapKey = `${idempotency.ownerPrincipalId}:${idempotency.operation}:${idempotency.key}`;
        const existing = idempotentResponses.get(mapKey);
        if (existing !== undefined) {
          if (existing.fingerprint !== idempotency.requestFingerprint) {
            throw new IdempotencyConflictError();
          }
          return existing.response;
        }
        const created = await operation();
        idempotentResponses.set(mapKey, {
          fingerprint: idempotency.requestFingerprint,
          response: created,
        });
        return created;
      },
    },
  };
}

function request(
  method: string,
  body?: unknown,
  csrf = false,
  cookiePayload: DraftCookiePayload | null = null,
): Request {
  const init: RequestInit = {
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(csrf ? { "x-csrf-token": "valid-csrf" } : {}),
      "idempotency-key": "00000000-0000-4000-8000-000000000099",
      ...(cookiePayload === null
        ? {}
        : {
            cookie: `report_draft=${createDraftCookie(
              cookiePayload,
              "test-secret-that-is-long-enough",
              new Date("2026-09-03T00:00:00.000Z"),
            )}`,
          }),
    },
    method,
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  return new Request("https://example.test/api/v1/report-intents", init);
}

describe("report intent HTTP adapters", () => {
  it("returns strict no-store JSON and an opaque signed cookie on create", async () => {
    const handlers = createReportIntentHttpHandlers(deps());
    const response = await handlers.create(request("POST", { locale: "en-IN" }, true));
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toMatch(/^report_draft=v1\./u);
    expect(await response.json()).toEqual({
      draft: { locale: "en-IN", schemaVersion: "1.0.0" },
      intent: expect.objectContaining({ id: record.id, version: 1 }),
    });
  });

  it("returns a typed, correlated problem and requires an idempotency key", async () => {
    const handlers = createReportIntentHttpHandlers(deps());
    const noKey = request("POST", { locale: "en-IN" }, true);
    noKey.headers.delete("idempotency-key");
    const response = await handlers.create(noKey);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      code: "IDEMPOTENCY_KEY_REQUIRED",
      correlationId: "corr-test-001",
      status: 400,
      title: "Request could not be completed.",
      type: "https://numerology.example/problems/IDEMPOTENCY_KEY_REQUIRED",
    });
    expect(response.headers.get("content-type")).toContain("application/problem+json");

    const malformedKey = request("POST", { locale: "en-IN" }, true);
    malformedKey.headers.set("idempotency-key", "create-request-000001");
    const malformedResponse = await handlers.create(malformedKey);
    expect(malformedResponse.status).toBe(400);
    expect(await malformedResponse.json()).toMatchObject({ code: "IDEMPOTENCY_KEY_REQUIRED" });
  });

  it("replays the same owner/operation/body and rejects UUID reuse with another body", async () => {
    const dependencies = deps();
    const handlers = createReportIntentHttpHandlers(dependencies);
    const first = await handlers.create(request("POST", { locale: "en-IN" }, true));
    const replay = await handlers.create(request("POST", { locale: "en-IN" }, true));
    const conflict = await handlers.create(request("POST", { locale: "hi-IN" }, true));

    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(await replay.json()).toEqual(await first.json());
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ code: "IDEMPOTENCY_KEY_CONFLICT" });
    expect(dependencies.commands.create).toHaveBeenCalledTimes(1);
  });

  it("adds Secure only when the explicit production cookie policy is enabled", async () => {
    const handlers = createReportIntentHttpHandlers({ ...deps(), cookieSecure: true });
    const response = await handlers.create(request("POST", { locale: "en-IN" }, true));
    expect(response.status).toBe(201);
    expect(response.headers.get("set-cookie")).toContain("; Secure");
  });

  it("fails closed for auth, CSRF, unknown patch keys, and oversized bodies", async () => {
    const unauthenticatedHandlers = createReportIntentHttpHandlers(deps(false));
    expect(
      (await unauthenticatedHandlers.get(request("GET", undefined, false, null), record.id)).status,
    ).toBe(401);

    const handlers = createReportIntentHttpHandlers(deps());
    const cookie = {
      expiresAt: "2026-09-10T00:00:00.000Z",
      intentId: record.id,
    } as const;
    expect(
      (
        await handlers.patch(
          request("PATCH", { expectedVersion: 1, patch: {} }, false, cookie),
          record.id,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await handlers.patch(
          request("PATCH", { expectedVersion: 1, patch: { unknown: "x" } }, true, cookie),
          record.id,
        )
      ).status,
    ).toBe(400);
    expect(
      (await handlers.complete(request("POST", { input: { junk: "x" } }, true, cookie), record.id))
        .status,
    ).toBe(400);
  });

  it("accepts a bodyless deterministic preview and never places input in response metadata", async () => {
    const handlers = createReportIntentHttpHandlers(deps());
    const cookie = {
      expiresAt: "2026-09-10T00:00:00.000Z",
      intentId: record.id,
    } as const;
    const response = await handlers.preview(request("POST", undefined, false, cookie), record.id);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      locale: "en-IN",
      values: [{ label: "Life path", value: "7" }],
    });
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("set-cookie")).toMatch(/^report_draft=v1\./u);
  });

  it("requires the verified cookie to match the route and maps conflicts without PII", async () => {
    const handlers = createReportIntentHttpHandlers(deps());
    const mismatched = {
      expiresAt: "2026-09-10T00:00:00.000Z",
      intentId: "00000000-0000-4000-8000-000000000004",
    } as const;
    const missing = await handlers.get(request("GET", undefined, false, null), record.id);
    expect(missing.status).toBe(401);
    const mismatch = await handlers.get(request("GET", undefined, false, mismatched), record.id);
    expect(mismatch.status).toBe(401);
    const forged = request("GET", undefined, false, {
      expiresAt: "2026-09-10T00:00:00.000Z",
      intentId: record.id,
    });
    const forgedCookie = forged.headers
      .get("cookie")
      ?.replace("report_draft=v1.", "report_draft=v1.A");
    const forgedResponse = await handlers.get(
      new Request(forged.url, { headers: { cookie: forgedCookie ?? "" } }),
      record.id,
    );
    expect(forgedResponse.status).toBe(401);

    const commandDeps = deps();
    commandDeps.commands.complete = vi.fn(async () => {
      throw new OptimisticConcurrencyError();
    });
    const conflictResponse = await createReportIntentHttpHandlers(commandDeps).complete(
      request(
        "POST",
        {
          input: {
            consents: {
              marketingEmail: false,
              noticeVersion: "privacy-1",
              requiredProcessing: true,
            },
            delivery: { email: "person@example.com" },
            locale: "en-IN",
            schemaVersion: "1.0.0",
            subject: {
              dateOfBirth: "1990-08-12",
              names: [
                { kind: "birth_full", value: "Thomas Cruise" },
                { kind: "popular", value: "Tom Cruise" },
              ],
              yClassifications: {},
            },
          },
        },
        true,
        {
          expiresAt: "2026-09-10T00:00:00.000Z",
          intentId: record.id,
        },
      ),
      record.id,
    );
    expect(conflictResponse.status).toBe(409);
    const errorBody = await conflictResponse.text();
    expect(errorBody).not.toContain("person@example.com");
    expect(errorBody).not.toContain(record.id);
  });
});
