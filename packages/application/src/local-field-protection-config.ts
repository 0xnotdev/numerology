import type { FieldProtector } from "./field-protection";
import { LocalEnvelopeFieldProtector } from "./local-envelope-field-protector";

const BASE64_256_BIT_KEY = /^[A-Za-z0-9+/]{43}=$/u;

function required(environment: Record<string, string | undefined>, name: string): string {
  const value = environment[name];
  if (value === undefined || value.length === 0) {
    throw new TypeError(`Local field-protection configuration is missing ${name}.`);
  }
  return value;
}

function decodeKey(environment: Record<string, string | undefined>, name: string): Buffer {
  const encoded = required(environment, name);
  if (!BASE64_256_BIT_KEY.test(encoded)) {
    throw new TypeError(`${name} must be a canonical base64-encoded 256-bit key.`);
  }
  const decoded = Buffer.from(encoded, "base64");
  if (decoded.byteLength !== 32) {
    throw new TypeError(`${name} must decode to exactly 32 bytes.`);
  }
  return decoded;
}

export function createLocalFieldProtectorFromEnvironment(
  environment: Record<string, string | undefined>,
): FieldProtector {
  const keyVersion = Number(required(environment, "FIELD_PROTECTION_KEY_VERSION"));
  if (!Number.isInteger(keyVersion) || keyVersion < 1 || keyVersion > 32_767) {
    throw new TypeError("FIELD_PROTECTION_KEY_VERSION must be an integer from 1 to 32767.");
  }

  return new LocalEnvelopeFieldProtector({
    keyEncryptionKey: decodeKey(environment, "FIELD_PROTECTION_KEK_BASE64"),
    keyId: required(environment, "FIELD_PROTECTION_KEY_ID"),
    keyVersion,
    lookupKey: decodeKey(environment, "FIELD_LOOKUP_HMAC_KEY_BASE64"),
  });
}
