import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabasePool, createPostgresTransactionRunner, runMigrations } from "./index";
import { resetTestDatabase } from "./test-support";

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://numerology:numerology@127.0.0.1:5432/numerology_test";
const pool = createDatabasePool({ connectionString, max: 2 });

describe("PostgresTransactionRunner", () => {
  beforeAll(async () => {
    await resetTestDatabase(pool, connectionString);
    await runMigrations(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("rolls back every write when an application transaction fails", async () => {
    const transactionRunner = createPostgresTransactionRunner(pool);
    const principalId = "0199a72d-3f45-7df1-a730-1722c2538920";

    await expect(
      transactionRunner.run(async (transaction) => {
        await transaction.query(
          `INSERT INTO principals
            (id, email_ciphertext, email_lookup_hmac, email_key_version, locale)
           VALUES ($1, $2, $3, 1, 'en-IN')`,
          [principalId, Buffer.from("ciphertext"), Buffer.alloc(32, 1)],
        );
        throw new Error("simulated application failure");
      }),
    ).rejects.toThrow("simulated application failure");

    const result = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM principals WHERE id = $1",
      [principalId],
    );
    expect(result.rows[0]?.count).toBe("0");
  });
});
