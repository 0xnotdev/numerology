import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { DatabasePool } from "./pool";
import * as schema from "./schema";

const migrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));

export async function runMigrations(pool: DatabasePool): Promise<void> {
  const database = drizzle(pool, { schema });
  await migrate(database, {
    migrationsFolder,
    migrationsSchema: "public",
    migrationsTable: "schema_migrations",
  });
}
