import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabasePool, runMigrations } from "./index";
import { resetTestDatabase } from "./test-support";

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://numerology:numerology@127.0.0.1:5432/numerology_test";
const pool = createDatabasePool({ connectionString, max: 2 });

describe("current migrations preserve Checkpoint 1 and add Checkpoint 4 report fixtures", () => {
  beforeAll(async () => {
    await resetTestDatabase(pool, connectionString);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("migrates an empty PostgreSQL 17 database to the exact current table set", async () => {
    await runMigrations(pool);

    const versionResult = await pool.query<{ server_version_num: string }>(
      "SHOW server_version_num",
    );
    const tablesResult = await pool.query<{ table_name: string }>(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
        ORDER BY table_name`,
    );

    expect(Number(versionResult.rows[0]?.server_version_num)).toBeGreaterThanOrEqual(170_000);
    expect(tablesResult.rows.map((row) => row.table_name)).toEqual([
      "access_challenges",
      "audit_events",
      "consent_events",
      "entitlements",
      "job_attempts",
      "name_uses",
      "orders",
      "principals",
      "report_intents",
      "reports",
      "schema_migrations",
      "sessions",
      "subjects",
    ]);
  });

  it("keeps audit evidence append-only", async () => {
    const auditId = "0199a72d-3f45-7df1-a730-1722c2538917";
    await pool.query(
      `INSERT INTO audit_events
        (id, actor_type, action, target_type, target_id, correlation_id, occurred_at)
       VALUES ($1, 'system', 'migration_verified', 'database', $2, 'test-correlation', now())`,
      [auditId, "0199a72d-3f45-7df1-a730-1722c2538918"],
    );

    await expect(
      pool.query("UPDATE audit_events SET action = 'rewritten' WHERE id = $1", [auditId]),
    ).rejects.toMatchObject({ code: "55000" });
    await expect(
      pool.query("DELETE FROM audit_events WHERE id = $1", [auditId]),
    ).rejects.toMatchObject({ code: "55000" });
  });
});
