import { describe, expect, it } from "vitest";
import { parseAppEnvironment, parseDatabaseEnvironment } from "./environment";

describe("parseAppEnvironment", () => {
  it("provides safe local defaults", () => {
    expect(parseAppEnvironment({})).toEqual({
      APP_ENV: "development",
      APP_ORIGIN: "http://localhost:3000",
      APP_VERSION: "0.1.0",
      LOG_LEVEL: "info",
    });
  });

  it("rejects a non-URL origin", () => {
    expect(() => parseAppEnvironment({ APP_ORIGIN: "localhost" })).toThrow();
  });
});

describe("parseDatabaseEnvironment", () => {
  it("provides bounded local persistence defaults", () => {
    expect(parseDatabaseEnvironment({})).toEqual({
      DATABASE_CONNECTION_TIMEOUT_MS: 2000,
      DATABASE_POOL_MAX: 5,
      DATABASE_READINESS_TIMEOUT_MS: 75,
      DATABASE_URL: "postgresql://numerology:numerology@127.0.0.1:5432/numerology",
    });
  });
});
