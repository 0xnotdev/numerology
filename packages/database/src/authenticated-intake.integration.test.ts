import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  createAuthenticatedReportIntentHandlers,
  createDefaultReportIntentHttpDependencies,
  LocalEnvelopeFieldProtector,
} from "@numerology/application";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createDatabasePool,
  createPostgresCreateIdempotency,
  createReportIntentRepository,
  runMigrations,
} from "./index";
import { createPostgresSessionRepository } from "./session-repository";
import { resetTestDatabase, seedSyntheticIdentity } from "./test-support";

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://numerology:numerology@127.0.0.1:5432/numerology_test";
const pool = createDatabasePool({ connectionString, max: 3 });
const protector = new LocalEnvelopeFieldProtector({
  keyEncryptionKey: Buffer.alloc(32, 0x61),
  lookupKey: Buffer.alloc(32, 0x62),
  keyId: "session-test",
});
const start = new Date("2026-09-04T10:00:00Z");

describe("session-bound intake HTTP", () => {
  beforeAll(async () => {
    await resetTestDatabase(pool, connectionString);
    await runMigrations(pool);
  });
  afterAll(() => pool.end());

  it("requires a live database session, matching CSRF and draft cookie; ignores claimed identity", async () => {
    const principalId = randomUUID();
    const subjectId = randomUUID();
    await seedSyntheticIdentity(pool, protector, { principalId, subjectId, now: start });
    const token = randomBytes(32).toString("base64url");
    const csrf = randomBytes(32).toString("base64url");
    const sessionId = randomUUID();
    await pool.query(
      `INSERT INTO sessions (id, principal_id, token_digest, csrf_digest, last_seen_at, expires_at, absolute_expires_at, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $6, $5)`,
      [
        sessionId,
        principalId,
        createHash("sha256").update(`numerology:session:v1:${token}`).digest(),
        createHash("sha256").update(`numerology:csrf:v1:${csrf}`).digest(),
        start,
        new Date(start.valueOf() + 3600000),
      ],
    );
    let now = start;
    const dependencies = {
      protector,
      clock: { now: () => now },
      idGenerator: { next: randomUUID },
    };
    const http = createDefaultReportIntentHttpDependencies({
      ...dependencies,
      repository: createReportIntentRepository(pool),
      createIdempotency: createPostgresCreateIdempotency(pool, dependencies),
      createOwnerPrincipalId: () => null,
      ownerPrincipalId: () => null,
      readCsrf: () => false,
      createSubjectId: () => subjectId,
      correlationId: () => "session-test",
      cookieSecure: true,
      draftCookieSecret: "session-test-secret-at-least-32-characters",
      rateLimiter: { consume: () => ({ allowed: true, remaining: 4, retryAfterSeconds: 0 }) },
    });
    const handlers = createAuthenticatedReportIntentHandlers({
      http,
      sessions: createPostgresSessionRepository(pool),
      origin: "https://example.test",
    });
    const request = (
      cookie = `__Host-numerology_session=${token}`,
      origin = "https://example.test",
      csrfToken = csrf,
    ) =>
      new Request("https://example.test/api/v1/report-intents", {
        method: "POST",
        headers: {
          cookie,
          origin,
          "x-csrf-token": csrfToken,
          "idempotency-key": randomUUID(),
          "x-owner-principal-id": principalId,
        },
        body: JSON.stringify({ locale: "en-IN" }),
      });
    expect((await handlers.create(request(""))).status).toBe(401);
    expect(
      (
        await handlers.create(
          request(`__Host-numerology_session=${randomBytes(32).toString("base64url")}`),
        )
      ).status,
    ).toBe(401);
    expect((await handlers.create(request(undefined, "https://attacker.test"))).status).toBe(403);
    expect((await handlers.create(request(undefined, undefined, "wrong"))).status).toBe(403);
    expect(
      (
        await handlers.create(
          request(`__Host-numerology_session=${token}; __Host-numerology_session=${token}`),
        )
      ).status,
    ).toBe(401);
    const created = await handlers.create(request());
    expect(created.status).toBe(201);
    const body = (await created.json()) as { intent: { id: string } };
    const draftCookie = created.headers.get("set-cookie")?.split(";")[0];
    const resume = new Request(`https://example.test/api/v1/report-intents/${body.intent.id}`, {
      headers: {
        cookie: `__Host-numerology_session=${token}; ${draftCookie}`,
        "x-owner-principal-id": randomUUID(),
      },
    });
    expect((await handlers.get(resume, body.intent.id)).status).toBe(200);
    expect(
      (
        await handlers.get(
          new Request(resume.url, { headers: { cookie: `__Host-numerology_session=${token}` } }),
          body.intent.id,
        )
      ).status,
    ).toBe(401);
    now = new Date(start.valueOf() + 3600000);
    expect((await handlers.get(resume, body.intent.id)).status).toBe(401);
    now = start;
    await pool.query("UPDATE sessions SET revoked_at = $1 WHERE id = $2", [start, sessionId]);
    expect((await handlers.get(resume, body.intent.id)).status).toBe(401);
  });
});
