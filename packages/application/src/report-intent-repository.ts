export type SupportedLocale = "en-IN" | "hi-IN" | "or-IN";
export type ReportIntentStatus =
  | "draft"
  | "complete"
  | "preview_ready"
  | "checkout_created"
  | "abandoned"
  | "converted"
  | "expired";

export interface CreateReportIntent {
  readonly draftCiphertext: Uint8Array;
  readonly expiresAt: Date;
  readonly id: string;
  readonly inputSchemaVersion: string;
  readonly locale: SupportedLocale;
  readonly now: Date;
  readonly ownerPrincipalId: string;
  readonly subjectId: string;
}

export interface ReportIntentRecord {
  readonly createdAt: Date;
  readonly draftCiphertext: Uint8Array;
  readonly expiresAt: Date;
  readonly id: string;
  readonly inputHash: Uint8Array | null;
  readonly inputSchemaVersion: string;
  readonly inputSnapshotCiphertext: Uint8Array | null;
  readonly locale: SupportedLocale;
  readonly noticeVersion: string | null;
  readonly ownerPrincipalId: string;
  readonly requiredConsentAt: Date | null;
  readonly status: ReportIntentStatus;
  readonly subjectId: string;
  readonly updatedAt: Date;
  readonly version: number;
}

export interface CompleteReportIntent {
  readonly expectedVersion: number;
  readonly id: string;
  readonly inputHash: Uint8Array;
  readonly inputSnapshotCiphertext: Uint8Array;
  readonly noticeVersion: string;
  readonly now: Date;
  readonly ownerPrincipalId: string;
  readonly requiredConsentAt: Date;
}

export interface ExpireDueReportIntentDrafts {
  readonly before: Date;
  readonly limit: number;
  readonly now: Date;
  readonly tombstoneCiphertext: Uint8Array;
}

export interface SaveReportIntentDraft {
  readonly draftCiphertext: Uint8Array;
  readonly expectedVersion: number;
  readonly id: string;
  readonly now: Date;
  readonly ownerPrincipalId: string;
}

export class OptimisticConcurrencyError extends Error {
  readonly code = "INTENT_VERSION_CONFLICT";

  constructor() {
    super("The report intent changed after this version was loaded.");
    this.name = "OptimisticConcurrencyError";
  }
}

export class ReportIntentNotFoundError extends Error {
  readonly code = "REPORT_INTENT_NOT_FOUND";

  constructor() {
    super("The report intent was not found.");
    this.name = "ReportIntentNotFoundError";
  }
}

export interface ReportIntentRepository {
  complete(input: CompleteReportIntent): Promise<ReportIntentRecord>;
  create(input: CreateReportIntent): Promise<ReportIntentRecord>;
  expireDueDrafts(input: ExpireDueReportIntentDrafts): Promise<number>;
  findByIdForOwner(id: string, ownerPrincipalId: string): Promise<ReportIntentRecord | null>;
  saveDraft(input: SaveReportIntentDraft): Promise<ReportIntentRecord>;
}
