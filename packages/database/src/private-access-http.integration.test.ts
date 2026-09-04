import { createHash, randomUUID } from "node:crypto";
import {
  createPrivateAccessHttpHandlers,
  LocalEnvelopeFieldProtector,
} from "@numerology/application";
import { buildCheckpointFourReportFixture, projectCustomerDelivery } from "@numerology/report";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import release from "../../../data/doctrine/releases/checkpoint4-fallback.compiled.json";
import { createDatabasePool } from "./pool";
import { runMigrations } from "./migrations";
import { createPostgresPrivateAccessRepository } from "./private-access-repository";
import { createPostgresSessionRepository } from "./session-repository";
import {
  resetTestDatabase,
  seedCheckpointFourReadyReportFixture,
  seedSyntheticIdentity,
} from "./test-support";

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://numerology:numerology@127.0.0.1:5432/numerology_test";
const pool = createDatabasePool({ connectionString, max: 4 });
const now = new Date("2026-09-04T00:00:00.000Z");
const origin = "https://numerology.test";
const owner = randomUUID();
const other = randomUUID();
const protector = new LocalEnvelopeFieldProtector({
  keyEncryptionKey: Buffer.alloc(32, 0x41),
  keyId: "private-http-test",
  lookupKey: Buffer.alloc(32, 0x42),
});
const fixture = buildCheckpointFourReportFixture(release);
const access = createPostgresPrivateAccessRepository(pool);
const sessions = createPostgresSessionRepository(pool);
const handlers = createPrivateAccessHttpHandlers({
  access,
  sessions,
  protector,
  origin,
  clock: { now: () => now },
});
const digest = (purpose: string, value: string) =>
  createHash("sha256").update(`numerology:${purpose}:v1:${value}`).digest();
let sequence = 10;
async function session(principalId = owner, age = 0) {
  const token = Buffer.alloc(32, sequence++).toString("base64url");
  const csrf = Buffer.alloc(32, sequence++).toString("base64url");
  await pool.query(
    `INSERT INTO sessions (id, principal_id, token_digest, csrf_digest, created_at, last_seen_at, expires_at, absolute_expires_at)
    VALUES ($1,$2,$3,$4,$5,$5,$6,$6)`,
    [
      randomUUID(),
      principalId,
      digest("session", token),
      digest("csrf", csrf),
      new Date(now.valueOf() - age),
      new Date(now.valueOf() + 86_400_000),
    ],
  );
  return { token, csrf };
}
function request(
  identity: { token: string; csrf: string },
  method = "GET",
  body?: unknown,
  key: string = randomUUID(),
  extra: Record<string, string> = {},
) {
  return new Request(`${origin}/api/v1/account`, {
    method,
    headers: {
      cookie: `__Host-numerology_session=${identity.token}`,
      origin,
      "x-csrf-token": identity.csrf,
      "content-type": "application/json",
      "idempotency-key": key,
      ...extra,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function problem(response: Response, status: number) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  const value = await response.json();
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid problem response");
  const { correlationId, ...body } = value as Record<string, unknown>;
  expect(correlationId).toMatch(/^[0-9a-f-]{36}$/u);
  return body;
}

describe("private HTTP with real encrypted PostgreSQL state", () => {
  beforeAll(async () => {
    await resetTestDatabase(pool, connectionString);
    await runMigrations(pool);
    await seedCheckpointFourReadyReportFixture(pool, protector, fixture, {
      environment: "test",
      now,
      principalId: owner,
      subjectId: randomUUID(),
      intentId: randomUUID(),
      orderId: randomUUID(),
      jobAttemptId: randomUUID(),
      entitlementId: randomUUID(),
    });
    await seedSyntheticIdentity(pool, protector, {
      now,
      principalId: other,
      subjectId: randomUUID(),
    });
  });
  afterAll(async () => {
    await pool.end();
  });

  it("delivers exactly the customer projection and hides every inaccessible target uniformly", async () => {
    const identity = await session();
    const foreign = await session(other);
    const response = await handlers.report(request(identity), fixture.report.reportId);
    expect(response.status).toBe(200);
    const actual = await response.json();
    expect(actual).toEqual(
      projectCustomerDelivery(fixture.report, fixture.bundle, fixture.verification),
    );
    expect(JSON.stringify(actual)).not.toMatch(
      /principalId|ciphertext|reportHash|confidence|ranking|verificationJson/u,
    );
    const account = await handlers.account(request(identity));
    expect(await account.json()).toEqual({
      reports: [
        {
          id: fixture.report.reportId,
          title: fixture.report.title,
          locale: "en-IN",
          status: "ready",
          readyAt: now.toISOString(),
        },
      ],
    });
    const baseline = await problem(
      await handlers.report(request(foreign), fixture.report.reportId),
      404,
    );
    for (const id of [randomUUID(), "malformed-id"]) {
      expect(await problem(await handlers.report(request(identity), id), 404)).toEqual(baseline);
    }
    expect(
      await problem(
        await handlers.signedPdf(request(foreign, "POST"), fixture.report.reportId),
        404,
      ),
    ).toEqual(baseline);
    await problem(
      await handlers.signedPdf(request(identity, "POST"), fixture.report.reportId),
      501,
    );
  });

  it("records one denied lifecycle audit without a receipt and rejects stale or cross-origin mutations", async () => {
    const identity = await session(other);
    const deniedBefore = await pool.query(
      "SELECT count(*)::int AS n FROM audit_events WHERE action='private.request.denied'",
    );
    await problem(
      await handlers.lifecycle(
        request(identity, "POST", { action: "correction" }),
        fixture.report.reportId,
      ),
      404,
    );
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM private_access_requests WHERE principal_id=$1",
          [other],
        )
      ).rows[0]?.n,
    ).toBe(0);
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM audit_events WHERE action='private.request.denied'",
        )
      ).rows[0]?.n,
    ).toBe(deniedBefore.rows[0]?.n + 1);
    const stale = await session(owner, 15 * 60_000 + 1);
    for (const action of ["export", "deletion"]) {
      expect(
        await problem(
          await handlers.lifecycle(request(stale, "POST", { action }), fixture.report.reportId),
          401,
        ),
      ).toMatchObject({ code: "REAUTHENTICATION_REQUIRED" });
    }
    await problem(await handlers.revokeAll(request(stale, "POST")), 401);
    const current = await session();
    for (const extra of [{ origin: "https://attacker.test" }, { "x-csrf-token": "invalid" }]) {
      await problem(
        await handlers.lifecycle(
          request(current, "POST", { action: "correction" }, randomUUID(), extra),
          fixture.report.reportId,
        ),
        403,
      );
      await problem(
        await handlers.signedPdf(
          request(current, "POST", undefined, randomUUID(), extra),
          fixture.report.reportId,
        ),
        403,
      );
      await problem(
        await handlers.revokeAll(request(current, "POST", undefined, randomUUID(), extra)),
        403,
      );
    }
  });

  it("replays a concurrent accepted request across adapter restarts and UUID casing", async () => {
    const identity = await session();
    const key = randomUUID();
    const submit = (id: string) =>
      handlers.lifecycle(request(identity, "POST", { action: "export" }, key), id);
    const responses = await Promise.all([
      submit(fixture.report.reportId),
      submit(fixture.report.reportId),
    ]);
    expect(responses.map((r) => r.status)).toEqual([202, 202]);
    const [first, second] = responses;
    if (!first || !second) throw new Error("Missing concurrent response");
    const receipt = await first.json();
    expect(await second.json()).toEqual(receipt);
    const restarted = createPrivateAccessHttpHandlers({
      access: createPostgresPrivateAccessRepository(pool),
      sessions,
      protector,
      origin,
      clock: { now: () => now },
    });
    const replay = await restarted.lifecycle(
      request(identity, "POST", { action: "export" }, key.toUpperCase()),
      fixture.report.reportId.toUpperCase(),
    );
    expect(replay.status).toBe(202);
    expect(await replay.json()).toEqual(receipt);
    await problem(
      await handlers.lifecycle(
        request(identity, "POST", { action: "deletion" }, key),
        fixture.report.reportId,
      ),
      409,
    );
  });

  it("rolls back receipt and revocation if their audit insert fails, then revokes only the owner", async () => {
    const identity = await session();
    const foreign = await session(other);
    const auditId = randomUUID();
    await access.appendAudit({
      id: auditId,
      actorType: "system",
      action: "private.account.denied",
      targetType: "account",
      targetId: owner,
      correlationId: randomUUID(),
      occurredAt: now,
      safeMetadata: { outcome: "denied" },
    });
    const key = randomUUID();
    await expect(
      access.createLifecycleRequest({
        id: randomUUID(),
        action: "correction",
        principalId: owner,
        reportId: fixture.report.reportId,
        idempotencyKey: key,
        requestFingerprint: `sha256:${"a".repeat(64)}`,
        auditEventId: auditId,
        correlationId: randomUUID(),
        now,
      }),
    ).rejects.toMatchObject({ code: "23505" });
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM private_access_requests WHERE idempotency_key=$1",
          [key],
        )
      ).rows[0]?.n,
    ).toBe(0);
    await expect(
      access.revokeAllSessions({
        principalId: owner,
        now,
        auditEventId: auditId,
        correlationId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "23505" });
    expect(await sessions.findActive(digest("session", identity.token), now)).not.toBeNull();
    const response = await handlers.revokeAll(request(identity, "POST"));
    expect(response.status).toBe(204);
    expect(response.headers.getSetCookie()).toHaveLength(3);
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM sessions WHERE principal_id=$1 AND revoked_at IS NULL",
          [owner],
        )
      ).rows[0]?.n,
    ).toBe(0);
    await problem(await handlers.account(request(identity)), 401);
    expect(await sessions.findActive(digest("session", foreign.token), now)).not.toBeNull();
  });

  it("rejects arbitrary personal strings under otherwise allowed audit metadata keys", async () => {
    await expect(
      access.appendAudit({
        id: randomUUID(),
        actorType: "system",
        action: "private.account.denied",
        targetType: "account",
        targetId: owner,
        correlationId: randomUUID(),
        occurredAt: now,
        safeMetadata: { outcome: "Jane-Doe" } as never,
      }),
    ).rejects.toThrow("AUDIT_METADATA_INVALID");
  });
});
