export type FieldPurpose =
  | "principal_email"
  | "subject_date_of_birth"
  | "name_display"
  | "name_normalized"
  | "report_intent_draft"
  | "report_intent_snapshot"
  | "report_intent_create_response"
  | "report_generation_input"
  | "report_calculation_snapshot"
  | "report_evidence_snapshot"
  | "report_plan_snapshot"
  | "structured_report_snapshot";

export const PROTECTED_FIELD_FORMAT_VERSION = 1 as const;

export interface ProtectedField {
  /** Versioned serialized envelope, including authenticated key metadata. */
  readonly ciphertext: Uint8Array;
  readonly formatVersion: typeof PROTECTED_FIELD_FORMAT_VERSION;
  readonly keyId: string;
  readonly keyVersion: number;
}

/** Validates and returns the exact bytes persisted in a protected-field column. */
export function serializeProtectedField(field: ProtectedField): Uint8Array {
  if (
    field.formatVersion !== PROTECTED_FIELD_FORMAT_VERSION ||
    field.keyId.length === 0 ||
    !Number.isSafeInteger(field.keyVersion) ||
    field.keyVersion < 1 ||
    field.keyVersion > 32_767 ||
    field.ciphertext.byteLength < 9
  ) {
    throw new FieldProtectionError();
  }
  const bytes = new Uint8Array(field.ciphertext);
  if (bytes[0] !== 0x4e || bytes[1] !== 0x46 || bytes[2] !== 0x50 || bytes[3] !== 0x31) {
    throw new FieldProtectionError();
  }
  const keyIdLength = (bytes[4] ?? 0) * 256 + (bytes[5] ?? 0);
  const serializedKeyVersion = (bytes[6] ?? 0) * 256 + (bytes[7] ?? 0);
  const serializedKeyId = new TextDecoder().decode(bytes.slice(8, 8 + keyIdLength));
  if (
    serializedKeyId !== field.keyId ||
    serializedKeyVersion !== field.keyVersion ||
    8 + keyIdLength >= bytes.byteLength
  ) {
    throw new FieldProtectionError();
  }
  return bytes;
}

export interface FieldProtector {
  protect(plaintext: string, purpose: FieldPurpose): Promise<ProtectedField>;
  reveal(protectedField: ProtectedField | Uint8Array, purpose: FieldPurpose): Promise<string>;
  lookup(plaintext: string, purpose: FieldPurpose): Promise<Uint8Array>;
}

export class FieldProtectionError extends Error {
  readonly code = "FIELD_PROTECTION_FAILED";

  constructor() {
    super("The protected value could not be revealed.");
    this.name = "FieldProtectionError";
  }
}
