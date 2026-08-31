import { afterAll, describe, expect, it } from "vitest";
import { createDatabasePool, createDatabaseReadinessProbe } from "./index";

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://numerology:numerology@127.0.0.1:5432/numerology_test";
const pool = createDatabasePool({ connectionString, max: 1 });

describe("database readiness probe", () => {
  afterAll(async () => {
    await pool.end();
  });

  it("reports a reachable PostgreSQL database as ready", async () => {
    const probe = createDatabaseReadinessProbe(pool, { timeoutMs: 75 });

    await expect(probe.check()).resolves.toBe(true);
  });

  it("returns unavailable within its deadline when PostgreSQL cannot be reached", async () => {
    const unavailablePool = createDatabasePool({
      connectionString: "postgresql://numerology:numerology@127.0.0.1:1/numerology_test",
      connectionTimeoutMillis: 25,
      max: 1,
    });
    const probe = createDatabaseReadinessProbe(unavailablePool, { timeoutMs: 50 });

    await expect(probe.check()).resolves.toBe(false);
    await unavailablePool.end();
  });
});
