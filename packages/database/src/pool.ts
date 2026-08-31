import { Pool } from "pg";

export interface DatabasePoolOptions {
  readonly connectionString: string;
  readonly connectionTimeoutMillis?: number;
  readonly idleTimeoutMillis?: number;
  readonly max?: number;
}

export function createDatabasePool(options: DatabasePoolOptions): Pool {
  return new Pool({
    allowExitOnIdle: true,
    application_name: "numerology-platform",
    connectionString: options.connectionString,
    connectionTimeoutMillis: options.connectionTimeoutMillis ?? 2_000,
    idleTimeoutMillis: options.idleTimeoutMillis ?? 10_000,
    max: options.max ?? 5,
  });
}

export type DatabasePool = Pool;
