import type { ReportId, ReportVerificationRecord, ReportVersions } from "@numerology/report";
import type { ProtectedField } from "./field-protection";
import type { SupportedLocale } from "./report-intent-repository";

export interface EncryptedReportSnapshots {
  readonly calculation: ProtectedField;
  readonly evidence: ProtectedField;
  readonly input: ProtectedField;
  readonly plan: ProtectedField;
  readonly structuredReport: ProtectedField;
}

export interface CreateFixtureReadyReport {
  readonly createdAt: Date;
  readonly entitlementId: string;
  readonly jobAttemptId: string;
  readonly locale: SupportedLocale;
  readonly orderId: string;
  readonly planHash: string;
  readonly principalId: string;
  readonly productVersion: string;
  readonly reportHash: string;
  readonly reportId: ReportId;
  readonly reportIntentId: string;
  readonly reportVersion: number;
  readonly snapshots: EncryptedReportSnapshots;
  readonly subjectId: string;
  readonly verification: ReportVerificationRecord;
  readonly versions: ReportVersions;
}

export interface FixtureReadyReportRecord {
  readonly createdAt: Date;
  readonly locale: SupportedLocale;
  readonly orderId: string;
  readonly planHash: string;
  readonly reportHash: string;
  readonly reportId: ReportId;
  readonly reportVersion: number;
  readonly status: "ready";
  readonly subjectId: string;
  readonly verificationRecordHash: string;
}

export interface ReportGenerationRepository {
  createFixtureReady(input: CreateFixtureReadyReport): Promise<FixtureReadyReportRecord>;
  findReadyById(reportId: ReportId): Promise<FixtureReadyReportRecord | null>;
}
