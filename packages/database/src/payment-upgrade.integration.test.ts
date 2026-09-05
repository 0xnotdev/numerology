import { fileURLToPath } from "node:url";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { afterAll, expect, it } from "vitest";
import { createDatabasePool, runMigrations, verifyCheckpointEightSchema } from "./index";
import { resetTestDatabase } from "./test-support";

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://numerology:numerology@127.0.0.1:5432/numerology_test";
const pool = createDatabasePool({ connectionString, max: 2 });
afterAll(async () => pool.end());

it("upgrades a committed CP7 database, not only an empty database, and replays without change", async () => {
  await resetTestDatabase(pool, connectionString);
  // Restore the actual committed pre-payment schema and migration ledger. Enum additions have
  // different PostgreSQL rules on upgrades than when the enum was created in the same transaction.
  const baseline = readMigrationFiles({
    migrationsFolder: fileURLToPath(new URL("../migrations", import.meta.url)),
  }).slice(0, 13);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "CREATE TABLE schema_migrations(id SERIAL PRIMARY KEY,hash text NOT NULL,created_at bigint)",
    );
    for (const migration of baseline) {
      for (const statement of migration.sql) await client.query(statement);
      await client.query("INSERT INTO schema_migrations(hash,created_at) VALUES($1,$2)", [
        migration.hash,
        migration.folderMillis,
      ]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  await expect(runMigrations(pool)).resolves.toBeUndefined();
  expect((await verifyCheckpointEightSchema(pool)).valid).toBe(true);
  await expect(runMigrations(pool)).resolves.toBeUndefined();
});
