import { LocalEnvelopeFieldProtector } from "@numerology/application";
import { buildCheckpointFourReportFixture } from "@numerology/report";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import checkpointFourRelease from "../../../data/doctrine/releases/checkpoint4-fallback.compiled.json";
import { createDatabasePool, createPostgresPrivateAccessRepository, runMigrations } from "./index";
import {
  resetTestDatabase,
  seedCheckpointFourReadyReportFixture,
  seedSyntheticIdentity,
} from "./test-support";

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://numerology:numerology@127.0.0.1:5432/numerology_test";
const pool = createDatabasePool({ connectionString, max: 3 });
const protector = new LocalEnvelopeFieldProtector({
  keyEncryptionKey: Buffer.alloc(32, 0x71),
  keyId: "private-access-test-v1",
  lookupKey: Buffer.alloc(32, 0x72),
});
const fixture = buildCheckpointFourReportFixture(checkpointFourRelease);
const now = new Date("2026-09-04T00:00:00.000Z");
const owner = "0199a72d-3f45-7df1-a730-1722c2538a10";
const subject = "0199a72d-3f45-7df1-a730-1722c2538a11";
const other = "0199a72d-3f45-7df1-a730-1722c2538a12";
const ids = {
  entitlementId: "0199a72d-3f45-7df1-a730-1722c2538a13",
  environment: "test" as const,
  intentId: "0199a72d-3f45-7df1-a730-1722c2538a14",
  jobAttemptId: "0199a72d-3f45-7df1-a730-1722c2538a15",
  now,
  orderId: "0199a72d-3f45-7df1-a730-1722c2538a16",
  principalId: owner,
  subjectId: subject,
};

describe("private-access PostgreSQL authorization and request receipts", () => {
  beforeAll(async () => {
    await resetTestDatabase(pool, connectionString);
    await runMigrations(pool);
    await seedCheckpointFourReadyReportFixture(pool, protector, fixture, ids);
    await seedSyntheticIdentity(pool, protector, {
      now,
      principalId: other,
      subjectId: "0199a72d-3f45-7df1-a730-1722c2538a17",
    });
  });

  afterAll(async () => {
    await pool.end();
  });

  it("only returns a ready report for its owner and active view entitlement", async () => {
    const repository = createPostgresPrivateAccessRepository(pool);
    const listed = await repository.listEntitledReports(owner, now);
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      id: fixture.report.reportId,
      locale: "en-IN",
      status: "ready",
    });
    expect(listed[0]).not.toHaveProperty("principalId");

    await expect(
      repository.findEntitledReport(other, fixture.report.reportId, now),
    ).resolves.toBeNull();
    await pool.query(
      "UPDATE entitlements SET actions = ARRAY['export']::text[] WHERE principal_id = $1",
      [owner],
    );
    await expect(
      repository.findEntitledReport(owner, fixture.report.reportId, now),
    ).resolves.toBeNull();
    await pool.query(
      "UPDATE entitlements SET actions = ARRAY['view']::text[] WHERE principal_id = $1",
      [owner],
    );
    await pool.query("UPDATE entitlements SET revoked_at = $1 WHERE principal_id = $2", [
      now,
      owner,
    ]);
    await expect(
      repository.findEntitledReport(owner, fixture.report.reportId, now),
    ).resolves.toBeNull();
  });

  it("persists idempotent lifecycle receipts and rejects a same-key payload change", async () => {
    await pool.query("UPDATE entitlements SET revoked_at = NULL WHERE principal_id = $1", [owner]);
    const repository = createPostgresPrivateAccessRepository(pool);
    const input = {
      action: "export" as const,
      auditEventId: "0199a72d-3f45-7df1-a730-1722c2538a18",
      correlationId: "private-test",
      id: "0199a72d-3f45-7df1-a730-1722c2538a19",
      idempotencyKey: "0199a72d-3f45-7df1-a730-1722c2538a20",
      now,
      principalId: owner,
      reportId: fixture.report.reportId,
      requestFingerprint: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    };
    const first = await repository.createLifecycleRequest(input);
    const replay = await repository.createLifecycleRequest({
      ...input,
      auditEventId: "0199a72d-3f45-7df1-a730-1722c2538a21",
      id: "0199a72d-3f45-7df1-a730-1722c2538a22",
    });
    expect(first).toEqual(replay);
    await expect(
      repository.createLifecycleRequest({
        ...input,
        action: "deletion",
        auditEventId: "0199a72d-3f45-7df1-a730-1722c2538a23",
        id: "0199a72d-3f45-7df1-a730-1722c2538a24",
        requestFingerprint:
          "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      }),
    ).rejects.toThrow("IDEMPOTENCY_KEY_CONFLICT");
    await expect(
      pool.query(
        "SELECT count(*)::int AS count FROM private_access_requests WHERE principal_id = $1",
        [owner],
      ),
    ).resolves.toMatchObject({ rows: [{ count: 1 }] });
    await expect(
      pool.query(
        "SELECT count(*)::int AS count FROM audit_events WHERE action LIKE 'private.request.%'",
      ),
    ).resolves.toMatchObject({ rows: [{ count: 3 }] });

    await pool.query(
      `INSERT INTO sessions
        (id, principal_id, token_digest, csrf_digest, last_seen_at, expires_at, absolute_expires_at, created_at)
       VALUES
        ($1, $3, $4, $5, $6, $7, $8, $6),
        ($2, $3, $9, $10, $6, $7, $8, $6)`,
      [
        "0199a72d-3f45-7df1-a730-1722c2538a25",
        "0199a72d-3f45-7df1-a730-1722c2538a26",
        owner,
        Buffer.alloc(32, 1),
        Buffer.alloc(32, 2),
        now,
        new Date(now.valueOf() + 86_400_000),
        new Date(now.valueOf() + 86_400_000),
        Buffer.alloc(32, 3),
        Buffer.alloc(32, 4),
      ],
    );
    await expect(
      repository.revokeAllSessions({
        auditEventId: "0199a72d-3f45-7df1-a730-1722c2538a27",
        correlationId: "private-revoke-test",
        now,
        principalId: owner,
      }),
    ).resolves.toBe(2);
    await expect(
      pool.query(
        "SELECT count(*)::int AS count FROM sessions WHERE principal_id = $1 AND revoked_at = $2",
        [owner, now],
      ),
    ).resolves.toMatchObject({ rows: [{ count: 2 }] });
    await expect(
      pool.query(
        "SELECT count(*)::int AS count FROM audit_events WHERE action = 'private.sessions.revoke_all'",
      ),
    ).resolves.toMatchObject({ rows: [{ count: 1 }] });
  });
});
