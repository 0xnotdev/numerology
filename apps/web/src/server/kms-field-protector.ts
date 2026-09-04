import {
  DecryptCommand,
  GenerateDataKeyCommand,
  GenerateMacCommand,
  KMSClient,
} from "@aws-sdk/client-kms";
import {
  FieldProtectionError,
  type FieldProtector,
  type FieldPurpose,
  PROTECTED_FIELD_FORMAT_VERSION,
  type ProtectedField,
  serializeProtectedField,
} from "@numerology/application";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const MAGIC = Buffer.from("NFP1", "ascii");
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/u;

export interface KmsFieldProtectorOptions {
  readonly encryptionKeyId: string;
  readonly keyId: string;
  readonly keyVersion: number;
  readonly lookupKeyId: string;
  readonly transport?: KmsTransport;
}

export interface KmsTransport {
  send(command: GenerateDataKeyCommand | DecryptCommand | GenerateMacCommand): Promise<unknown>;
}

function requiredString(value: string | undefined, _name: string): string {
  if (value === undefined || value.trim().length === 0 || value.length > 2048) {
    throw new TypeError("FIELD_PROTECTION_KMS_CONFIGURATION_INVALID");
  }
  return value;
}

function requiredVersion(value: string | undefined): number {
  const version = Number(requiredString(value, "FIELD_PROTECTION_KEY_VERSION"));
  if (!Number.isInteger(version) || version < 1 || version > 32_767) {
    throw new TypeError("FIELD_PROTECTION_KMS_CONFIGURATION_INVALID");
  }
  return version;
}

function purposeData(keyId: string, keyVersion: number, purpose: FieldPurpose): Buffer {
  return Buffer.from(`numerology-field:v1:${keyId}:${keyVersion}:${purpose}`, "utf8");
}

function encode(value: Uint8Array): string {
  return Buffer.from(value).toString("base64");
}

function decode(value: unknown): Buffer {
  if (typeof value !== "string" || !BASE64.test(value)) throw new Error("FIELD_ENVELOPE_INVALID");
  const bytes = Buffer.from(value, "base64");
  if (bytes.byteLength === 0 || bytes.toString("base64") !== value) {
    throw new Error("FIELD_ENVELOPE_INVALID");
  }
  return bytes;
}

function serializeEnvelope(keyId: string, keyVersion: number, payload: string): Uint8Array {
  const id = Buffer.from(keyId, "utf8");
  if (id.byteLength === 0 || id.byteLength > 65_535 || payload.length === 0) {
    throw new Error("FIELD_ENVELOPE_INVALID");
  }
  const header = Buffer.alloc(8);
  MAGIC.copy(header, 0);
  header.writeUInt16BE(id.byteLength, 4);
  header.writeUInt16BE(keyVersion, 6);
  return Buffer.concat([header, id, Buffer.from(payload, "utf8")]);
}

function parseEnvelope(value: Uint8Array): { keyId: string; keyVersion: number; payload: string } {
  const bytes = Buffer.from(value);
  if (bytes.byteLength < 9 || !bytes.subarray(0, 4).equals(MAGIC)) {
    throw new Error("FIELD_ENVELOPE_INVALID");
  }
  const keyLength = bytes.readUInt16BE(4);
  const payloadStart = 8 + keyLength;
  if (keyLength === 0 || payloadStart >= bytes.byteLength)
    throw new Error("FIELD_ENVELOPE_INVALID");
  const keyId = bytes.subarray(8, payloadStart).toString("utf8");
  const payload = bytes.subarray(payloadStart).toString("utf8");
  if (Buffer.from(keyId, "utf8").byteLength !== keyLength || payload.length === 0) {
    throw new Error("FIELD_ENVELOPE_INVALID");
  }
  return { keyId, keyVersion: bytes.readUInt16BE(6), payload };
}

function parsePayload(
  payload: string,
  keyId: string,
  keyVersion: number,
): {
  readonly ciphertext: Buffer;
  readonly dataIv: Buffer;
  readonly dataTag: Buffer;
  readonly wrappedKey: Buffer;
} {
  const candidate: unknown = JSON.parse(payload);
  if (typeof candidate !== "object" || candidate === null)
    throw new Error("FIELD_ENVELOPE_INVALID");
  const envelope = candidate as Record<string, unknown>;
  if (
    envelope.version !== PROTECTED_FIELD_FORMAT_VERSION ||
    envelope.keyId !== keyId ||
    envelope.keyVersion !== keyVersion
  ) {
    throw new Error("FIELD_ENVELOPE_INVALID");
  }
  const ciphertext = decode(envelope.ciphertext);
  const dataIv = decode(envelope.dataIv);
  const dataTag = decode(envelope.dataTag);
  const wrappedKey = decode(envelope.wrappedKey);
  if (
    dataIv.byteLength !== IV_BYTES ||
    dataTag.byteLength !== TAG_BYTES ||
    wrappedKey.byteLength === 0
  ) {
    throw new Error("FIELD_ENVELOPE_INVALID");
  }
  return { ciphertext, dataIv, dataTag, wrappedKey };
}

function encrypted(value: Uint8Array, key: Uint8Array, aad: Uint8Array) {
  const iv = Buffer.from(requireRandomBytes(IV_BYTES));
  const cipher = createCipheriv(ALGORITHM, Buffer.from(key), iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(Buffer.from(aad));
  return {
    ciphertext: Buffer.concat([cipher.update(Buffer.from(value)), cipher.final()]),
    iv,
    tag: cipher.getAuthTag(),
  };
}

function requireRandomBytes(length: number): Uint8Array {
  return randomBytes(length);
}

function decrypt(
  value: Uint8Array,
  key: Uint8Array,
  iv: Uint8Array,
  tag: Uint8Array,
  aad: Uint8Array,
): Buffer {
  const decipher = createDecipheriv(ALGORITHM, Buffer.from(key), Buffer.from(iv), {
    authTagLength: TAG_BYTES,
  });
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(Buffer.from(tag));
  return Buffer.concat([decipher.update(Buffer.from(value)), decipher.final()]);
}

/** Production field protection using AWS KMS-generated data keys and a KMS HMAC lookup key. */
export class KmsEnvelopeFieldProtector implements FieldProtector {
  readonly #encryptionKeyId: string;
  readonly #keyId: string;
  readonly #keyVersion: number;
  readonly #lookupKeyId: string;
  readonly #transport: KmsTransport;

  constructor(options: KmsFieldProtectorOptions) {
    this.#encryptionKeyId = requiredString(options.encryptionKeyId, "FIELD_PROTECTION_KMS_KEY_ID");
    this.#lookupKeyId = requiredString(options.lookupKeyId, "FIELD_LOOKUP_KMS_KEY_ID");
    this.#keyId = requiredString(options.keyId, "FIELD_PROTECTION_KEY_ID");
    if (
      !Number.isInteger(options.keyVersion) ||
      options.keyVersion < 1 ||
      options.keyVersion > 32_767
    ) {
      throw new TypeError("FIELD_PROTECTION_KMS_CONFIGURATION_INVALID");
    }
    this.#keyVersion = options.keyVersion;
    this.#transport = options.transport ?? new KMSClient({ region: "ap-south-1" });
  }

  async protect(plaintext: string, purpose: FieldPurpose): Promise<ProtectedField> {
    const generated = (await this.#transport.send(
      new GenerateDataKeyCommand({ KeyId: this.#encryptionKeyId, KeySpec: "AES_256" }),
    )) as { CiphertextBlob?: Uint8Array; Plaintext?: Uint8Array };
    if (
      generated.CiphertextBlob === undefined ||
      generated.Plaintext === undefined ||
      generated.Plaintext.byteLength !== KEY_BYTES
    ) {
      throw new Error("FIELD_PROTECTION_KMS_UNAVAILABLE");
    }
    const encryptedValue = encrypted(
      Buffer.from(plaintext, "utf8"),
      generated.Plaintext,
      purposeData(this.#keyId, this.#keyVersion, purpose),
    );
    const ciphertext = serializeEnvelope(
      this.#keyId,
      this.#keyVersion,
      JSON.stringify({
        ciphertext: encode(encryptedValue.ciphertext),
        dataIv: encode(encryptedValue.iv),
        dataTag: encode(encryptedValue.tag),
        keyId: this.#keyId,
        keyVersion: this.#keyVersion,
        version: PROTECTED_FIELD_FORMAT_VERSION,
        wrappedKey: encode(generated.CiphertextBlob),
      }),
    );
    return {
      ciphertext: serializeProtectedField({
        ciphertext,
        formatVersion: PROTECTED_FIELD_FORMAT_VERSION,
        keyId: this.#keyId,
        keyVersion: this.#keyVersion,
      }),
      formatVersion: PROTECTED_FIELD_FORMAT_VERSION,
      keyId: this.#keyId,
      keyVersion: this.#keyVersion,
    };
  }

  async reveal(
    protectedField: ProtectedField | Uint8Array,
    purpose: FieldPurpose,
  ): Promise<string> {
    try {
      const bytes =
        protectedField instanceof Uint8Array ? protectedField : protectedField.ciphertext;
      const serialized = parseEnvelope(bytes);
      if (serialized.keyId !== this.#keyId || serialized.keyVersion !== this.#keyVersion) {
        throw new Error("FIELD_ENVELOPE_INVALID");
      }
      if (
        !(protectedField instanceof Uint8Array) &&
        (protectedField.formatVersion !== PROTECTED_FIELD_FORMAT_VERSION ||
          protectedField.keyId !== serialized.keyId ||
          protectedField.keyVersion !== serialized.keyVersion)
      ) {
        throw new Error("FIELD_ENVELOPE_INVALID");
      }
      const envelope = parsePayload(serialized.payload, serialized.keyId, serialized.keyVersion);
      const decrypted = (await this.#transport.send(
        new DecryptCommand({ CiphertextBlob: envelope.wrappedKey, KeyId: this.#encryptionKeyId }),
      )) as { Plaintext?: Uint8Array };
      if (decrypted.Plaintext === undefined || decrypted.Plaintext.byteLength !== KEY_BYTES) {
        throw new Error("FIELD_PROTECTION_KMS_UNAVAILABLE");
      }
      return decrypt(
        envelope.ciphertext,
        decrypted.Plaintext,
        envelope.dataIv,
        envelope.dataTag,
        purposeData(this.#keyId, this.#keyVersion, purpose),
      ).toString("utf8");
    } catch {
      throw new FieldProtectionError();
    }
  }

  async lookup(plaintext: string, purpose: FieldPurpose): Promise<Uint8Array> {
    const message = Buffer.from(`numerology-lookup:v1\0${purpose}\0${plaintext}`, "utf8");
    const result = (await this.#transport.send(
      new GenerateMacCommand({
        KeyId: this.#lookupKeyId,
        MacAlgorithm: "HMAC_SHA_256",
        Message: message,
      }),
    )) as { Mac?: Uint8Array };
    if (result.Mac === undefined || result.Mac.byteLength !== 32) {
      throw new Error("FIELD_PROTECTION_KMS_UNAVAILABLE");
    }
    return result.Mac;
  }
}

export function createKmsFieldProtectorFromEnvironment(
  environment: Record<string, string | undefined>,
  transport?: KmsTransport,
): FieldProtector {
  return new KmsEnvelopeFieldProtector({
    encryptionKeyId: requiredString(
      environment.FIELD_PROTECTION_KMS_KEY_ID,
      "FIELD_PROTECTION_KMS_KEY_ID",
    ),
    keyId: requiredString(environment.FIELD_PROTECTION_KEY_ID, "FIELD_PROTECTION_KEY_ID"),
    keyVersion: requiredVersion(environment.FIELD_PROTECTION_KEY_VERSION),
    lookupKeyId: requiredString(environment.FIELD_LOOKUP_KMS_KEY_ID, "FIELD_LOOKUP_KMS_KEY_ID"),
    ...(transport === undefined ? {} : { transport }),
  });
}
