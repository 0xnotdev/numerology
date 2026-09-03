import { describe, expect, it } from "vitest";
import { PROTECTED_FIELD_FORMAT_VERSION, serializeProtectedField } from "./field-protection";
import { LocalEnvelopeFieldProtector } from "./local-envelope-field-protector";

const keyEncryptionKey = Buffer.alloc(32, 0x11);
const lookupKey = Buffer.alloc(32, 0x22);

describe("LocalEnvelopeFieldProtector", () => {
  it("protects and reveals a confidential value without storing its plaintext", async () => {
    const protector = new LocalEnvelopeFieldProtector({
      keyEncryptionKey,
      keyId: "local-test-v1",
      lookupKey,
    });

    const protectedValue = await protector.protect("Alice@example.com", "principal_email");

    expect(protectedValue.formatVersion).toBe(PROTECTED_FIELD_FORMAT_VERSION);
    expect(Buffer.from(protectedValue.ciphertext).subarray(0, 4).toString("ascii")).toBe("NFP1");
    expect(Buffer.from(serializeProtectedField(protectedValue))).toEqual(
      Buffer.from(protectedValue.ciphertext),
    );
    expect(Buffer.from(protectedValue.ciphertext).includes(Buffer.from("Alice@example.com"))).toBe(
      false,
    );
    await expect(protector.reveal(protectedValue, "principal_email")).resolves.toBe(
      "Alice@example.com",
    );
  });

  it("derives stable purpose-separated lookup digests", async () => {
    const protector = new LocalEnvelopeFieldProtector({
      keyEncryptionKey,
      keyId: "local-test-v1",
      lookupKey,
    });

    const first = await protector.lookup("alice@example.com", "principal_email");
    const second = await protector.lookup("alice@example.com", "principal_email");
    const otherPurpose = await protector.lookup("alice@example.com", "name_normalized");

    expect(Buffer.from(first).toString("hex")).toBe(Buffer.from(second).toString("hex"));
    expect(first).toHaveLength(32);
    expect(Buffer.from(first).toString("hex")).not.toBe(Buffer.from(otherPurpose).toString("hex"));
  });

  it("fails closed without exposing why a protected value cannot be revealed", async () => {
    const protector = new LocalEnvelopeFieldProtector({
      keyEncryptionKey,
      keyId: "local-test-v1",
      lookupKey,
    });
    const wrongKeyProtector = new LocalEnvelopeFieldProtector({
      keyEncryptionKey: Buffer.alloc(32, 0x33),
      keyId: "local-test-v1",
      lookupKey,
    });
    const protectedValue = await protector.protect("Alice@example.com", "principal_email");
    const expectedError = {
      code: "FIELD_PROTECTION_FAILED",
      message: "The protected value could not be revealed.",
      name: "FieldProtectionError",
    };

    await expect(wrongKeyProtector.reveal(protectedValue, "principal_email")).rejects.toMatchObject(
      expectedError,
    );
    await expect(protector.reveal(protectedValue, "name_normalized")).rejects.toMatchObject(
      expectedError,
    );
    await expect(
      protector.reveal(
        { ...protectedValue, keyVersion: protectedValue.keyVersion + 1 },
        "principal_email",
      ),
    ).rejects.toMatchObject(expectedError);
    expect(() =>
      serializeProtectedField({ ...protectedValue, ciphertext: Buffer.from("not-an-envelope") }),
    ).toThrow(expectedError.message);
  });
});
