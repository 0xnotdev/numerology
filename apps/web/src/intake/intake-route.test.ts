import { describe, expect, it } from "vitest";
import { parseIntakeRoute } from "./intake-route";

const id = "00000000-0000-4000-8000-000000000099";

describe("intake route boundary", () => {
  it("accepts only supported locales, opaque UUIDs, and known steps", () => {
    expect(parseIntakeRoute("hi-IN", id, "birth-date")).toEqual({
      intentId: id,
      locale: "hi-IN",
      step: "birth-date",
    });
  });

  it("rejects path traversal, arbitrary identifiers, and unsupported steps", () => {
    expect(parseIntakeRoute("en-IN", "../../private", "name")).toBeNull();
    expect(parseIntakeRoute("en-IN", "not-a-uuid", "name")).toBeNull();
    expect(parseIntakeRoute("en-IN", id, "calculation")).toBeNull();
    expect(parseIntakeRoute("fr-FR", id, "name")).toBeNull();
  });
});
