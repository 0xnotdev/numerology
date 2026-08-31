import { describe, expect, it } from "vitest";
import { randomIdGenerator } from "./id-generator";

describe("randomIdGenerator", () => {
  it("generates distinct application-owned 128-bit UUID identifiers", () => {
    const first = randomIdGenerator.next();
    const second = randomIdGenerator.next();

    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
    expect(second).not.toBe(first);
  });
});
