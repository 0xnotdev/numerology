import { describe, expect, it } from "vitest";
import { createLocalFieldProtectorFromEnvironment } from "./local-field-protection-config";

describe("createLocalFieldProtectorFromEnvironment", () => {
  it("constructs the local adapter only from explicit 256-bit keys", async () => {
    const protector = createLocalFieldProtectorFromEnvironment({
      FIELD_LOOKUP_HMAC_KEY_BASE64: Buffer.alloc(32, 7).toString("base64"),
      FIELD_PROTECTION_KEK_BASE64: Buffer.alloc(32, 3).toString("base64"),
      FIELD_PROTECTION_KEY_ID: "local-checkpoint-1",
      FIELD_PROTECTION_KEY_VERSION: "1",
    });

    const protectedField = await protector.protect("private@example.invalid", "principal_email");

    await expect(protector.reveal(protectedField, "principal_email")).resolves.toBe(
      "private@example.invalid",
    );
  });
});
