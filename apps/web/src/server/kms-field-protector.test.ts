import { DecryptCommand, GenerateDataKeyCommand, GenerateMacCommand } from "@aws-sdk/client-kms";
import { describe, expect, it } from "vitest";
import { KmsEnvelopeFieldProtector } from "./kms-field-protector";

const dataKey = Buffer.alloc(32, 0x21),
  wrapped = Buffer.from("opaque wrapped data key"),
  mac = Buffer.alloc(32, 0x33);
function protector() {
  return new KmsEnvelopeFieldProtector({
    encryptionKeyId: "alias/numerology-data",
    lookupKeyId: "alias/numerology-lookup",
    keyId: "production-v1",
    keyVersion: 1,
    transport: {
      async send(command) {
        if (command instanceof GenerateDataKeyCommand)
          return { Plaintext: dataKey, CiphertextBlob: wrapped };
        if (command instanceof DecryptCommand) return { Plaintext: dataKey };
        if (command instanceof GenerateMacCommand) return { Mac: mac };
        throw new Error("unexpected command");
      },
    },
  });
}
describe("KMS envelope field protection", () => {
  it("round-trips with purpose-bound authenticated encryption without persisting plaintext keys", async () => {
    const service = protector();
    const field = await service.protect("private-canary", "report_intent_draft");
    expect(Buffer.from(field.ciphertext).includes(Buffer.from("private-canary"))).toBe(false);
    expect(Buffer.from(field.ciphertext).includes(dataKey)).toBe(false);
    await expect(service.reveal(field, "report_intent_draft")).resolves.toBe("private-canary");
    await expect(service.reveal(field, "principal_email")).rejects.toThrow("protected value");
  });
  it("uses a non-exportable KMS HMAC lookup boundary", async () => {
    await expect(protector().lookup("person@example.invalid", "principal_email")).resolves.toEqual(
      mac,
    );
  });
});
