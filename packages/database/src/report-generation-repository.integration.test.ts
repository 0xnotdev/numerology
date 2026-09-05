import { LocalEnvelopeFieldProtector } from "@numerology/application";
import { buildCheckpointFourReportFixture, stableStructuredReport } from "@numerology/report";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import checkpointFourRelease from "../../../data/doctrine/releases/checkpoint4-fallback.compiled.json";
import { createDatabasePool, createReportGenerationRepository, runMigrations } from "./index";
import { resetTestDatabase, seedCheckpointFourReadyReportFixture } from "./test-support";

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://numerology:numerology@127.0.0.1:5432/numerology_test";
const pool = createDatabasePool({ connectionString, max: 3 });
const protector = new LocalEnvelopeFieldProtector({
  keyEncryptionKey: Buffer.alloc(32, 0x51),
  keyId: "checkpoint4-report-test-v1",
  lookupKey: Buffer.alloc(32, 0x52),
});
const fixture = buildCheckpointFourReportFixture(checkpointFourRelease);
const now = new Date("2026-09-01T00:00:00.000Z");
const ids = {
  entitlementId: "0199a72d-3f45-7df1-a730-1722c2538a04",
  environment: "test" as const,
  intentId: "0199a72d-3f45-7df1-a730-1722c2538a01",
  jobAttemptId: "0199a72d-3f45-7df1-a730-1722c2538a05",
  now,
  orderId: "0199a72d-3f45-7df1-a730-1722c2538a02",
  principalId: "0199a72d-3f45-7df1-a730-1722c2538a00",
  subjectId: "0199a72d-3f45-7df1-a730-1722c2538a03",
};

describe("Checkpoint 4 fixture report persistence", () => {
  beforeAll(async () => {
    await resetTestDatabase(pool, connectionString);
    await runMigrations(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("forbids the auth-disabled fixture seeder in production without writing rows", async () => {
    await expect(
      seedCheckpointFourReadyReportFixture(pool, protector, fixture, {
        ...ids,
        environment: "production",
      }),
    ).rejects.toThrow("CHECKPOINT4_FIXTURE_SEED_PRODUCTION_FORBIDDEN");
    await expect(pool.query("SELECT id FROM reports")).resolves.toMatchObject({ rowCount: 0 });
  });

  it("atomically seeds a non-payable order, encrypted snapshots, entitlement, and job evidence", async () => {
    const stored = await seedCheckpointFourReadyReportFixture(pool, protector, fixture, ids);
    expect(stored).toMatchObject({
      orderId: ids.orderId,
      planHash: fixture.plan.planHash,
      reportHash: fixture.report.reportHash,
      reportId: fixture.report.reportId,
      reportVersion: 1,
      status: "ready",
      verificationRecordHash: fixture.verification.recordHash,
    });
    await expect(
      createReportGenerationRepository(pool).findReadyById(fixture.report.reportId),
    ).resolves.toEqual(stored);

    const order = await pool.query<{ amount_paise: number; currency: string; payable: boolean }>(
      "SELECT amount_paise, currency, payable FROM orders WHERE id = $1",
      [ids.orderId],
    );
    expect(order.rows[0]).toEqual({ amount_paise: 0, currency: "INR", payable: false });
    const related = await pool.query<{ attempts: number; entitlements: number }>(
      `SELECT
         (SELECT count(*)::int FROM entitlements WHERE report_id = $1) AS entitlements,
         (SELECT count(*)::int FROM job_attempts WHERE report_id = $1) AS attempts`,
      [fixture.report.reportId],
    );
    expect(related.rows[0]).toEqual({ attempts: 1, entitlements: 1 });

    const snapshots = await pool.query<{
      calculation_snapshot_ciphertext: Buffer;
      evidence_snapshot_ciphertext: Buffer;
      input_snapshot_ciphertext: Buffer;
      plan_snapshot_ciphertext: Buffer;
      structured_report_ciphertext: Buffer;
    }>(
      `SELECT calculation_snapshot_ciphertext, evidence_snapshot_ciphertext,
              input_snapshot_ciphertext, plan_snapshot_ciphertext,
              structured_report_ciphertext
         FROM reports WHERE id = $1`,
      [fixture.report.reportId],
    );
    const row = snapshots.rows[0];
    if (row === undefined) {
      throw new Error("Missing persisted report fixture.");
    }
    await expect(
      protector.reveal(row.structured_report_ciphertext, "structured_report_snapshot"),
    ).resolves.toBe(stableStructuredReport(fixture.report));
    for (const bytes of Object.values(row)) {
      const storage = bytes.toString("utf8");
      expect(storage).not.toContain("THOMAS CRUISE MAPOTHER");
      expect(storage).not.toContain("A reflective numerology report");
    }
  });

  it("enforces non-payable, immutable-version, and append-only database boundaries", async () => {
    await expect(
      pool.query("UPDATE orders SET amount_paise = 49900 WHERE id = $1", [ids.orderId]),
    ).rejects.toMatchObject({ code: "55000" });
    await expect(
      pool.query("UPDATE reports SET report_hash = report_hash WHERE id = $1", [
        fixture.report.reportId,
      ]),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      pool.query("UPDATE job_attempts SET outcome = 'failed' WHERE report_id = $1", [
        fixture.report.reportId,
      ]),
    ).rejects.toMatchObject({ code: "55000" });
    await expect(
      pool.query(
        `INSERT INTO reports
         SELECT (jsonb_populate_record(
           NULL::reports,
           to_jsonb(existing) || jsonb_build_object('id', $2::text)
         )).* FROM reports AS existing WHERE id = $1`,
        [fixture.report.reportId, "0199a72d-3f45-7df1-a730-1722c2538a06"],
      ),
    ).rejects.toMatchObject({ code: "23505" });
  });
});
