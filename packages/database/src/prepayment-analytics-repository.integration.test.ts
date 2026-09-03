import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabasePool, runMigrations } from "./index";
import { createPrepaymentAnalyticsRepository } from "./prepayment-analytics-repository";
import { resetTestDatabase } from "./test-support";

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://numerology:numerology@127.0.0.1:5432/numerology_test";
const pool = createDatabasePool({ connectionString, max: 2 });

describe("pre-payment analytics repository", () => {
  beforeAll(async () => {
    await resetTestDatabase(pool, connectionString);
    await runMigrations(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("stores only allowlisted metadata with 90-day expiry and append-only enforcement", async () => {
    const repository = createPrepaymentAnalyticsRepository(pool);
    const id = "00000000-0000-4000-8000-000000000078";
    await repository.append({
      eventName: "intake_step_completed",
      expiresAt: new Date("2026-12-02T10:00:00.000Z"),
      id,
      occurredAt: new Date("2026-09-03T10:00:00.000Z"),
      properties: {
        elapsedBucket: "30_to_119_seconds",
        locale: "en-IN",
        step: "name",
      },
      schemaVersion: "1.0.0",
      sessionId: "00000000-0000-4000-8000-000000000077",
    });

    const rows = await pool.query<{
      event_name: string;
      expires_at: Date;
      properties: Record<string, unknown>;
    }>("SELECT event_name, expires_at, properties FROM analytics_events WHERE id = $1", [id]);
    expect(rows.rows).toEqual([
      {
        event_name: "intake_step_completed",
        expires_at: new Date("2026-12-02T10:00:00.000Z"),
        properties: {
          elapsedBucket: "30_to_119_seconds",
          locale: "en-IN",
          step: "name",
        },
      },
    ]);
    expect(JSON.stringify(rows.rows)).not.toMatch(/Thomas Cruise|1990-08-12|person@example\.com/u);
    await expect(
      pool.query(
        `INSERT INTO analytics_events
          (id, event_name, schema_version, session_id, properties, occurred_at, expires_at)
         VALUES ($1, 'intake_started', '1.0.0', $2, $3, $4, $4::timestamptz + interval '90 days')`,
        [
          "00000000-0000-4000-8000-000000000079",
          "00000000-0000-4000-8000-000000000077",
          { email: "person@example.com", locale: "en-IN" },
          new Date("2026-09-03T10:00:00.000Z"),
        ],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      pool.query("UPDATE analytics_events SET schema_version = '9.9.9' WHERE id = $1", [id]),
    ).rejects.toMatchObject({ code: "55000" });
    await expect(
      pool.query("DELETE FROM analytics_events WHERE id = $1", [id]),
    ).rejects.toMatchObject({ code: "55000" });
  });
});
