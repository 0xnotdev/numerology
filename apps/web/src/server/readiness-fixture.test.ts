import { describe, expect, it } from "vitest";
import { isDeveloperFixtureEnvironment } from "./readiness-fixture";

describe("developer readiness fixture access", () => {
  it("is available only in development and test", () => {
    expect(isDeveloperFixtureEnvironment("development")).toBe(true);
    expect(isDeveloperFixtureEnvironment("test")).toBe(true);
    expect(isDeveloperFixtureEnvironment("production")).toBe(false);
  });
});
