import { randomUUID } from "node:crypto";
import {
  type CreateIdempotencyRequest,
  createDefaultReportIntentHttpDependencies,
  createReportIntentHttpHandlers,
  LocalEnvelopeFieldProtector,
  type ReportIntentHttpDependencies,
} from "@numerology/application";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresCreateIdempotency } from "./create-idempotency";
import { createDatabasePool, createReportIntentRepository, runMigrations } from "./index";
import { resetTestDatabase, seedSyntheticIdentity } from "./test-support";

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://numerology:numerology@127.0.0.1:5432/numerology_test";
const pool = createDatabasePool({ connectionString, max: 3 });
const protector = new LocalEnvelopeFieldProtector({
  keyEncryptionKey: Buffer.alloc(32, 0x41),
  keyId: "idempotency-test",
  lookupKey: Buffer.alloc(32, 0x42),
});
type Operation = Parameters<ReportIntentHttpDependencies["createIdempotency"]["execute"]>[1];
const start = new Date("2026-09-04T10:00:00Z");

describe("durable create idempotency", () => {
  beforeAll(async () => {
    await resetTestDatabase(pool, connectionString);
    await runMigrations(pool);
  });
  afterAll(() => pool.end());

  it("recovers after PostgreSQL terminates the connection before the response commit", async () => {
    const ownerPrincipalId = randomUUID();
    const subjectId = randomUUID();
    await seedSyntheticIdentity(pool, protector, {
      principalId: ownerPrincipalId,
      subjectId,
      now: start,
    });
    const applicationName = `crash-test-${randomUUID()}`;
    const isolatedPool = new Pool({ connectionString, application_name: applicationName, max: 1 });
    const request: CreateIdempotencyRequest = {
      ownerPrincipalId,
      key: randomUUID(),
      resourceId: randomUUID(),
      operation: "report-intents.create",
      requestFingerprint: `sha256:${"c".repeat(64)}`,
      expiresAt: new Date(start.valueOf() + 86400000),
    };
    const dependencies = {
      protector,
      clock: { now: () => start },
      idGenerator: { next: randomUUID },
    };
    const operation: Operation = async (commands) => {
      if (!commands) throw new Error("Transaction-scoped commands required");
      await commands.create({
        id: request.resourceId,
        ownerPrincipalId,
        subjectId,
        locale: "en-IN",
      });
      return { body: { id: request.resourceId }, cookie: "cookie" };
    };
    try {
      await expect(
        createPostgresCreateIdempotency(isolatedPool, dependencies).execute(
          request,
          async (commands) => {
            const response = await operation(commands);
            const killed = await pool.query<{ terminated: boolean }>(
              "SELECT pg_terminate_backend(pid) AS terminated FROM pg_stat_activity WHERE application_name = $1 AND datname = current_database()",
              [applicationName],
            );
            expect(killed.rows).toEqual([{ terminated: true }]);
            return response;
          },
        ),
      ).rejects.toThrow();
      expect(
        await createReportIntentRepository(pool).findByIdForOwner(
          request.resourceId,
          ownerPrincipalId,
        ),
      ).toBeNull();
      await expect(
        createPostgresCreateIdempotency(pool, dependencies).execute(request, operation),
      ).resolves.toEqual({ body: { id: request.resourceId }, cookie: "cookie" });
    } finally {
      await isolatedPool.end();
    }
  });

  it("replays the exact encrypted response after restart and rolls back a failed create response", async () => {
    const ownerPrincipalId = randomUUID();
    const subjectId = randomUUID();
    await seedSyntheticIdentity(pool, protector, {
      principalId: ownerPrincipalId,
      subjectId,
      now: start,
    });
    let now = start;
    const dependencies = {
      protector,
      clock: { now: () => now },
      idGenerator: { next: randomUUID },
    };
    const request: CreateIdempotencyRequest = {
      ownerPrincipalId,
      key: randomUUID(),
      resourceId: randomUUID(),
      operation: "report-intents.create",
      requestFingerprint: `sha256:${"a".repeat(64)}`,
      expiresAt: new Date(start.valueOf() + 86400000),
    };
    const operation: Operation = async (commands) => {
      if (!commands) throw new Error("Transaction-scoped commands required");
      const result = await commands.create({
        id: request.resourceId,
        ownerPrincipalId,
        subjectId,
        locale: "en-IN",
      });
      return {
        body: { id: result.record.id, canary: "PRIVATE-REPLAY-CANARY" },
        cookie: "signed-cookie",
      };
    };
    const adapter = createPostgresCreateIdempotency(pool, dependencies);
    await expect(
      adapter.execute(request, async (commands) => {
        await operation(commands);
        throw new Error("response generation failed");
      }),
    ).rejects.toThrow("response generation failed");
    expect(
      await createReportIntentRepository(pool).findByIdForOwner(
        request.resourceId,
        ownerPrincipalId,
      ),
    ).toBeNull();
    const response = await adapter.execute(request, operation);
    const restarted = createPostgresCreateIdempotency(pool, dependencies);
    const mustNotCreate: Operation = async () => {
      throw new Error("replay attempted a second create");
    };
    await expect(restarted.execute(request, mustNotCreate)).resolves.toEqual(response);
    await expect(
      restarted.execute(
        { ...request, requestFingerprint: `sha256:${"b".repeat(64)}` },
        mustNotCreate,
      ),
    ).rejects.toThrow("IDEMPOTENCY_KEY_CONFLICT");
    const stored = await pool.query<{ exposed: boolean }>(
      "SELECT position(convert_to($1, 'UTF8') in response_ciphertext) > 0 AS exposed FROM report_intent_create_requests WHERE resource_id = $2",
      ["PRIVATE-REPLAY-CANARY", request.resourceId],
    );
    expect(stored.rows[0]?.exposed).toBe(false);
    now = request.expiresAt;
    await expect(
      restarted.execute(
        { ...request, expiresAt: new Date(now.valueOf() + 86400000) },
        mustNotCreate,
      ),
    ).rejects.toThrow("IDEMPOTENCY_KEY_EXPIRED");
  });

  it("serializes concurrent creates without blocking a pool client and isolates owners", async () => {
    const ownerPrincipalId = randomUUID();
    const subjectId = randomUUID();
    await seedSyntheticIdentity(pool, protector, {
      principalId: ownerPrincipalId,
      subjectId,
      now: start,
    });
    const dependencies = {
      protector,
      clock: { now: () => start },
      idGenerator: { next: randomUUID },
    };
    const request: CreateIdempotencyRequest = {
      ownerPrincipalId,
      key: randomUUID(),
      resourceId: randomUUID(),
      operation: "report-intents.create",
      requestFingerprint: `sha256:${"a".repeat(64)}`,
      expiresAt: new Date(start.valueOf() + 86400000),
    };
    let signalEntered = () => {};
    let signalRelease = () => {};
    const entered = new Promise<void>((resolve) => {
      signalEntered = resolve;
    });
    const release = new Promise<void>((resolve) => {
      signalRelease = resolve;
    });
    const adapter = createPostgresCreateIdempotency(pool, dependencies);
    const response = { body: { id: request.resourceId }, cookie: "cookie" };
    const first = adapter.execute(request, async (commands) => {
      signalEntered();
      await release;
      if (!commands) throw new Error("Transaction-scoped commands required");
      await commands.create({
        id: request.resourceId,
        ownerPrincipalId,
        subjectId,
        locale: "en-IN",
      });
      return response;
    });
    try {
      await entered;
      await expect(
        createPostgresCreateIdempotency(pool, dependencies).execute(request, async () => response),
      ).rejects.toThrow("IDEMPOTENCY_REQUEST_IN_PROGRESS");
    } finally {
      signalRelease();
    }
    await expect(first).resolves.toEqual(response);
    await expect(
      adapter.execute(request, async () => {
        throw new Error("duplicate");
      }),
    ).resolves.toEqual(response);
    const otherOwner = randomUUID();
    const otherSubject = randomUUID();
    await seedSyntheticIdentity(pool, protector, {
      principalId: otherOwner,
      subjectId: otherSubject,
      now: start,
    });
    const otherResource = randomUUID();
    await expect(
      adapter.execute(
        { ...request, ownerPrincipalId: otherOwner, resourceId: otherResource },
        async (commands) => {
          if (!commands) throw new Error("Transaction-scoped commands required");
          await commands.create({
            id: otherResource,
            ownerPrincipalId: otherOwner,
            subjectId: otherSubject,
            locale: "en-IN",
          });
          return { body: { id: otherResource }, cookie: "other-cookie" };
        },
      ),
    ).resolves.toEqual({ body: { id: otherResource }, cookie: "other-cookie" });
    expect(
      await createReportIntentRepository(pool).findByIdForOwner(request.resourceId, otherOwner),
    ).toBeNull();
  });

  it("uses transaction-scoped commands through HTTP and returns safe replay/conflict/expiry responses", async () => {
    const principalId = randomUUID();
    const subjectId = randomUUID();
    await seedSyntheticIdentity(pool, protector, { principalId, subjectId, now: start });
    let now = start;
    const dependencies = {
      protector,
      clock: { now: () => now },
      idGenerator: { next: randomUUID },
    };
    const handlers = createReportIntentHttpHandlers(
      createDefaultReportIntentHttpDependencies({
        ...dependencies,
        repository: createReportIntentRepository(pool),
        createIdempotency: createPostgresCreateIdempotency(pool, dependencies),
        createOwnerPrincipalId: () => principalId,
        ownerPrincipalId: () => principalId,
        createSubjectId: () => subjectId,
        readCsrf: () => true,
        rateLimiter: { consume: () => ({ allowed: true, remaining: 4, retryAfterSeconds: 0 }) },
        cookieSecure: true,
        draftCookieSecret: "synthetic-secret-at-least-32-characters",
        correlationId: () => "http-idempotency-test",
      }),
    );
    const key = randomUUID();
    const request = (locale = "en-IN", suppliedKey: string = key) =>
      new Request("https://example.test/api/v1/report-intents", {
        method: "POST",
        headers: { "Content-Type": "application/json", "idempotency-key": suppliedKey },
        body: JSON.stringify({ locale }),
      });
    const first = await handlers.create(request());
    const body = await first.json();
    expect(first.status, JSON.stringify(body)).toBe(201);
    expect(first.headers.get("set-cookie")).toContain("; Secure");
    const replay = await handlers.create(request("en-IN", key.toUpperCase()));
    expect(replay.status).toBe(201);
    expect(await replay.json()).toEqual(body);
    expect(replay.headers.get("set-cookie")).toBe(first.headers.get("set-cookie"));
    const conflict = await handlers.create(request("hi-IN"));
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ code: "IDEMPOTENCY_KEY_CONFLICT" });
    now = new Date(start.valueOf() + 86400000);
    const expired = await handlers.create(request());
    expect(expired.status).toBe(409);
    expect(await expired.json()).toMatchObject({ code: "IDEMPOTENCY_KEY_EXPIRED" });
    expect(expired.headers.get("set-cookie")).toBeNull();
  });
});
