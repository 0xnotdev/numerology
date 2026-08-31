import type { AppEnvironment } from "@numerology/contracts";

export function isDeveloperFixtureEnvironment(environment: AppEnvironment["APP_ENV"]): boolean {
  return environment === "development" || environment === "test";
}
