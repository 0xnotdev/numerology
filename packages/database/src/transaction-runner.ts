import type { TransactionRunner } from "@numerology/application";
import type { PoolClient } from "pg";
import type { DatabasePool } from "./pool";

export function createPostgresTransactionRunner(pool: DatabasePool): TransactionRunner<PoolClient> {
  return {
    async run<TResult>(work: (transaction: PoolClient) => Promise<TResult>): Promise<TResult> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await work(client);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch (rollbackError) {
          throw new AggregateError(
            [error, rollbackError],
            "The transaction and its rollback both failed.",
          );
        }
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
