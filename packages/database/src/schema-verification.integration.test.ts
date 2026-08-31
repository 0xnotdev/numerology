import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabasePool, runMigrations, verifyCheckpointOneSchema } from "./index";
import { resetTestDatabase } from "./test-support";

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://numerology:numerology@127.0.0.1:5432/numerology_test";
const pool = createDatabasePool({ connectionString, max: 2 });

describe("Checkpoint 1 schema verification", () => {
  beforeAll(async () => {
    await resetTestDatabase(pool, connectionString);
    await runMigrations(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("finds every required table, constraint, index, and immutability trigger", async () => {
    await expect(verifyCheckpointOneSchema(pool)).resolves.toEqual({
      missingConstraints: [],
      missingIndexes: [],
      missingTables: [],
      missingTriggers: [],
      valid: true,
    });
  });
});
