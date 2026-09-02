import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createDatabasePool,
  runMigrations,
  verifyCheckpointFourSchema,
  verifyCheckpointOneSchema,
} from "./index";
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

  it("finds every required Checkpoint 1 table, constraint, index, and trigger", async () => {
    await expect(verifyCheckpointOneSchema(pool)).resolves.toEqual({
      missingConstraints: [],
      missingIndexes: [],
      missingTables: [],
      missingTriggers: [],
      valid: true,
    });
  });

  it("finds the complete Checkpoint 4 fixture-only persistence and immutability contract", async () => {
    await expect(verifyCheckpointFourSchema(pool)).resolves.toEqual({
      missingConstraints: [],
      missingIndexes: [],
      missingTables: [],
      missingTriggers: [],
      valid: true,
    });
  });
});
