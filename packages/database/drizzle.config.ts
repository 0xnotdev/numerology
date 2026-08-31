import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://numerology:numerology@127.0.0.1:5432/numerology",
  },
  dialect: "postgresql",
  migrations: {
    schema: "public",
    table: "schema_migrations",
  },
  out: "./migrations",
  schema: "./src/schema.ts",
  strict: true,
  verbose: true,
});
