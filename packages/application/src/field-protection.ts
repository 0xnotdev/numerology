export type FieldPurpose =
  | "principal_email"
  | "subject_date_of_birth"
  | "name_display"
  | "name_normalized"
  | "report_intent_draft"
  | "report_intent_snapshot"
  | "report_generation_input"
  | "report_calculation_snapshot"
  | "report_evidence_snapshot"
  | "report_plan_snapshot"
  | "structured_report_snapshot";

export interface ProtectedField {
  readonly ciphertext: Uint8Array;
  readonly formatVersion: 1;
  readonly keyId: string;
  readonly keyVersion: number;
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
