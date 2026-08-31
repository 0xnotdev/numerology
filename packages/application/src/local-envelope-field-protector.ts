import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  type CipherGCM,
  type DecipherGCM,
} from "node:crypto";
import {
  FieldProtectionError,
  type FieldProtector,
  type FieldPurpose,
  type ProtectedField,
} from "./field-protection";

const ALGORITHM = "aes-256-gcm";
const AUTH_TAG_BYTES = 16;
const ENVELOPE_VERSION = 1 as const;
const IV_BYTES = 12;
const KEY_BYTES = 32;

interface LocalProtectorOptions {
  readonly keyEncryptionKey: Uint8Array;
  readonly keyId: string;
  readonly keyVersion?: number;
  readonly lookupKey: Uint8Array;
}

interface EnvelopeV1 {
  readonly ciphertext: string;
  readonly dataIv: string;
  readonly dataTag: string;
  readonly keyId: string;
  readonly keyVersion: number;
  readonly version: 1;
  readonly wrappedKey: string;
  readonly wrapIv: string;
  readonly wrapTag: string;
}

function additionalData(keyId: string, keyVersion: number, purpose: FieldPurpose): Buffer {
  return Buffer.from(`numerology-field:v1:${keyId}:${keyVersion}:${purpose}`, "utf8");
}

function encrypt(
  plaintext: Uint8Array,
  key: Uint8Array,
  iv: Uint8Array,
  aad: Uint8Array,
): { ciphertext: Buffer; tag: Buffer } {
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_BYTES,
  }) as CipherGCM;
  cipher.setAAD(aad);
  return {
    ciphertext: Buffer.concat([cipher.update(plaintext), cipher.final()]),
    tag: cipher.getAuthTag(),
  };
}

function decrypt(
  ciphertext: Uint8Array,
  key: Uint8Array,
  iv: Uint8Array,
  tag: Uint8Array,
  aad: Uint8Array,
): Buffer {
  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_BYTES,
  }) as DecipherGCM;
  decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function toBase64(value: Uint8Array): string {
  return Buffer.from(value).toString("base64");
}

function fromBase64(value: string): Buffer {
  return Buffer.from(value, "base64");
}

export class LocalEnvelopeFieldProtector implements FieldProtector {
  readonly #keyEncryptionKey: Uint8Array;
  readonly #keyId: string;
  readonly #keyVersion: number;
  readonly #lookupKey: Uint8Array;

  constructor(options: LocalProtectorOptions) {
    if (options.keyEncryptionKey.byteLength !== KEY_BYTES) {
      throw new TypeError("The local key-encryption key must contain exactly 32 bytes.");
    }
    if (options.lookupKey.byteLength !== KEY_BYTES) {
      throw new TypeError("The local lookup key must contain exactly 32 bytes.");
    }
    if (options.keyId.length === 0) {
      throw new TypeError("The local key identifier is required.");
    }

    this.#keyEncryptionKey = options.keyEncryptionKey;
    this.#keyId = options.keyId;
    this.#keyVersion = options.keyVersion ?? 1;
    this.#lookupKey = options.lookupKey;
  }

  async protect(plaintext: string, purpose: FieldPurpose): Promise<ProtectedField> {
    const dataKey = randomBytes(KEY_BYTES);
    const dataIv = randomBytes(IV_BYTES);
    const wrapIv = randomBytes(IV_BYTES);
    const aad = additionalData(this.#keyId, this.#keyVersion, purpose);
    const data = encrypt(Buffer.from(plaintext, "utf8"), dataKey, dataIv, aad);
    const wrapped = encrypt(dataKey, this.#keyEncryptionKey, wrapIv, aad);
    const envelope: EnvelopeV1 = {
      ciphertext: toBase64(data.ciphertext),
      dataIv: toBase64(dataIv),
      dataTag: toBase64(data.tag),
      keyId: this.#keyId,
      keyVersion: this.#keyVersion,
      version: ENVELOPE_VERSION,
      wrappedKey: toBase64(wrapped.ciphertext),
      wrapIv: toBase64(wrapIv),
      wrapTag: toBase64(wrapped.tag),
    };

    return {
      ciphertext: Buffer.from(JSON.stringify(envelope), "utf8"),
      formatVersion: ENVELOPE_VERSION,
      keyId: this.#keyId,
      keyVersion: this.#keyVersion,
    };
  }

  async reveal(
    protectedField: ProtectedField | Uint8Array,
    purpose: FieldPurpose,
  ): Promise<string> {
    try {
      const storedBytes =
        protectedField instanceof Uint8Array ? protectedField : protectedField.ciphertext;
      const envelope = JSON.parse(Buffer.from(storedBytes).toString("utf8")) as EnvelopeV1;
      if (
        envelope.version !== ENVELOPE_VERSION ||
        envelope.keyId !== this.#keyId ||
        envelope.keyVersion !== this.#keyVersion
      ) {
        throw new FieldProtectionError();
      }
      if (
        !(protectedField instanceof Uint8Array) &&
        (envelope.keyId !== protectedField.keyId ||
          envelope.keyVersion !== protectedField.keyVersion)
      ) {
        throw new FieldProtectionError();
      }

      const aad = additionalData(envelope.keyId, envelope.keyVersion, purpose);
      const dataKey = decrypt(
        fromBase64(envelope.wrappedKey),
        this.#keyEncryptionKey,
        fromBase64(envelope.wrapIv),
        fromBase64(envelope.wrapTag),
        aad,
      );
      const plaintext = decrypt(
        fromBase64(envelope.ciphertext),
        dataKey,
        fromBase64(envelope.dataIv),
        fromBase64(envelope.dataTag),
        aad,
      );
      return plaintext.toString("utf8");
    } catch {
      throw new FieldProtectionError();
    }
  }

  async lookup(plaintext: string, purpose: FieldPurpose): Promise<Uint8Array> {
    return createHmac("sha256", this.#lookupKey)
      .update("numerology-lookup:v1", "utf8")
      .update("\0", "utf8")
      .update(purpose, "utf8")
      .update("\0", "utf8")
      .update(plaintext, "utf8")
      .digest();
  }
}
