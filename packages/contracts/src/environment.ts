import { z } from "zod";

export const appEnvironmentSchema = z.object({
  APP_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ORIGIN: z.url().default("http://localhost:3000"),
  APP_VERSION: z.string().min(1).default("0.1.0"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type AppEnvironment = z.infer<typeof appEnvironmentSchema>;

export function parseAppEnvironment(candidate: Record<string, string | undefined>): AppEnvironment {
  return appEnvironmentSchema.parse(candidate);
}

export const databaseEnvironmentSchema = z.object({
  DATABASE_CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(100).max(10_000).default(2_000),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(20).default(5),
  DATABASE_READINESS_TIMEOUT_MS: z.coerce.number().int().min(1).max(99).default(75),
  DATABASE_URL: z.url().default("postgresql://numerology:numerology@127.0.0.1:5432/numerology"),
});

export type DatabaseEnvironment = z.infer<typeof databaseEnvironmentSchema>;

export function parseDatabaseEnvironment(
  candidate: Record<string, string | undefined>,
): DatabaseEnvironment {
  return databaseEnvironmentSchema.parse(candidate);
}
