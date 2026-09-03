import type { FieldProtector, FixtureReadyReportRecord } from "@numerology/application";
import { stableStringify } from "@numerology/engine";
import {
  CHECKPOINT4_FIXTURE_REQUEST,
  type CheckpointFourReportFixture,
  stableStructuredReport,
} from "@numerology/report";
import type { DatabasePool } from "./pool";
import { createReportGenerationRepository } from "./report-generation-repository";
import { createReportIntentRepository } from "./report-intent-repository";

function assertDedicatedTestDatabase(connectionString: string): void {
  const parsed = new URL(connectionString);
  if (
    parsed.pathname !== "/numerology_test" ||
    !["127.0.0.1", "localhost"].includes(parsed.hostname)
  ) {
    throw new Error("Test database reset is restricted to local database 'numerology_test'.");
  }
}

export async function resetTestDatabase(
  pool: DatabasePool,
  connectionString: string,
): Promise<void> {
  assertDedicatedTestDatabase(connectionString);
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
  await pool.query("CREATE SCHEMA public AUTHORIZATION numerology");
}

interface SyntheticIdentityOptions {
  readonly now: Date;
  readonly principalId: string;
  readonly subjectId: string;
}

export async function seedSyntheticIdentity(
  pool: DatabasePool,
  protector: FieldProtector,
  options: SyntheticIdentityOptions,
): Promise<void> {
  const email = `synthetic+${options.principalId}@example.invalid`;
  const emailCiphertext = await protector.protect(email, "principal_email");
  const emailLookupHmac = await protector.lookup(email.toLowerCase(), "principal_email");
  const dateOfBirthCiphertext = await protector.protect("1990-08-12", "subject_date_of_birth");
  const purgeAfter = new Date(options.now.getTime() + 30 * 24 * 60 * 60 * 1_000);

  await pool.query(
    `INSERT INTO principals
      (id, email_ciphertext, email_lookup_hmac, email_key_version, locale, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'en-IN', $5, $5)`,
    [
      options.principalId,
      Buffer.from(emailCiphertext.ciphertext),
      Buffer.from(emailLookupHmac),
      emailCiphertext.keyVersion,
      options.now,
    ],
  );
  await pool.query(
    `INSERT INTO subjects
      (id, owner_principal_id, date_of_birth_ciphertext, identity_key_version, created_at, purge_after)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      options.subjectId,
      options.principalId,
      Buffer.from(dateOfBirthCiphertext.ciphertext),
      dateOfBirthCiphertext.keyVersion,
      options.now,
      purgeAfter,
    ],
  );
}

export interface CheckpointFourSeedOptions {
  readonly entitlementId: string;
  readonly environment: "development" | "production" | "test";
  readonly intentId: string;
  readonly jobAttemptId: string;
  readonly now: Date;
  readonly orderId: string;
  readonly principalId: string;
  readonly subjectId: string;
}

/** Seeds the synthetic ready report only in an explicit local/test environment. */
export async function seedCheckpointFourReadyReportFixture(
  pool: DatabasePool,
  protector: FieldProtector,
  fixture: CheckpointFourReportFixture,
  options: CheckpointFourSeedOptions,
): Promise<FixtureReadyReportRecord> {
  if (options.environment === "production") {
    throw new RangeError("CHECKPOINT4_FIXTURE_SEED_PRODUCTION_FORBIDDEN");
  }
  await seedSyntheticIdentity(pool, protector, options);
  const draft = await protector.protect("{}", "report_intent_draft");
  const inputText = stableStringify(CHECKPOINT4_FIXTURE_REQUEST);
  const inputSnapshot = await protector.protect(inputText, "report_intent_snapshot");
  const intentRepository = createReportIntentRepository(pool);
  await intentRepository.create({
    draftCiphertext: draft.ciphertext,
    expiresAt: new Date(options.now.getTime() + 24 * 60 * 60 * 1_000),
    id: options.intentId,
    inputSchemaVersion: "1.0.0",
    locale: fixture.report.locale,
    now: options.now,
    ownerPrincipalId: options.principalId,
    subjectId: options.subjectId,
  });
  await intentRepository.complete({
    consentEvents: [
      {
        action: "granted",
        id: "0199a72d-3f45-7df1-a730-1722c2538a06",
        noticeLocale: fixture.report.locale,
        noticeVersion: "checkpoint4.synthetic.v1",
        occurredAt: options.now,
        purpose: "required_processing",
      },
      {
        action: "declined",
        id: "0199a72d-3f45-7df1-a730-1722c2538a07",
        noticeLocale: fixture.report.locale,
        noticeVersion: "checkpoint4.synthetic.v1",
        occurredAt: options.now,
        purpose: "analytics",
      },
      {
        action: "declined",
        id: "0199a72d-3f45-7df1-a730-1722c2538a08",
        noticeLocale: fixture.report.locale,
        noticeVersion: "checkpoint4.synthetic.v1",
        occurredAt: options.now,
        purpose: "marketing_email",
      },
    ],
    expectedVersion: 1,
    id: options.intentId,
    inputHash: Buffer.from(fixture.bundle.inputHash.slice("sha256:".length), "hex"),
    inputSnapshotCiphertext: inputSnapshot.ciphertext,
    noticeVersion: "checkpoint4.synthetic.v1",
    now: options.now,
    ownerPrincipalId: options.principalId,
    requiredConsentAt: options.now,
  });

  const [generationInput, calculation, evidence, plan, structuredReport] = await Promise.all([
    protector.protect(inputText, "report_generation_input"),
    protector.protect(stableStringify(fixture.bundle), "report_calculation_snapshot"),
    protector.protect(stableStringify(fixture.evidence), "report_evidence_snapshot"),
    protector.protect(stableStringify(fixture.plan), "report_plan_snapshot"),
    protector.protect(stableStructuredReport(fixture.report), "structured_report_snapshot"),
  ]);
  return createReportGenerationRepository(pool).createFixtureReady({
    createdAt: options.now,
    entitlementId: options.entitlementId,
    jobAttemptId: options.jobAttemptId,
    locale: fixture.report.locale,
    orderId: options.orderId,
    planHash: fixture.plan.planHash,
    principalId: options.principalId,
    productVersion: "report.in.fixture.v1",
    reportHash: fixture.report.reportHash,
    reportId: fixture.report.reportId,
    reportIntentId: options.intentId,
    reportVersion: fixture.report.reportVersion,
    snapshots: {
      calculation,
      evidence,
      input: generationInput,
      plan,
      structuredReport,
    },
    subjectId: options.subjectId,
    verification: fixture.verification,
    versions: fixture.report.versions,
  });
}
