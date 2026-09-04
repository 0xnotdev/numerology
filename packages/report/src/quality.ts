import { canonicalHash, ENGINE_VERSION, FORMULA_MANIFEST_HASH } from "@numerology/engine";
import { deepFreeze } from "@numerology/shared";
import { z } from "zod";
import { compareText } from "./candidate";
import {
  EVALUATION_RUNNER_VERSION,
  type EvaluationExecution,
  runEvaluationCorpusWithReports,
} from "./evaluation";
import { type EvaluationSubject, parseEvaluationCorpus } from "./evaluation-corpus";
import {
  DETERMINISTIC_WRITER_POLICY_VERSION,
  REPORT_RENDERER_VERSION,
  REPORT_SAFETY_POLICY_VERSION,
  REPORT_VERIFICATION_SCHEMA_VERSION,
  REPORT_VERIFIER_VERSION,
} from "./report-versions";
import {
  STRUCTURED_REPORT_SCHEMA_VERSION,
  type StructuredReport,
  SUPPORTED_REPORT_LOCALES,
  type SupportedReportLocale,
} from "./structured-report";
import { REPORT_PLAN_SCHEMA_VERSION, REPORT_PLANNER_VERSION } from "./types";
import { DETERMINISTIC_LOCALE_PACK_VERSION, DETERMINISTIC_WRITER_VERSION } from "./writer-locale";

export const QUALITY_ASSESSMENT_SCHEMA_VERSION = "1.0.0" as const;
export const QUALITY_ARTIFACT_SCHEMA_VERSION = "1.0.0" as const;
export const QUALITY_REVIEW_PACKET_SCHEMA_VERSION = "1.0.0" as const;
export const QUALITY_POLICY_VERSION = "cp7-release-quality.1.0.0" as const;

/** Canonical identity of data/report/eval-subjects.json at this checkpoint. */
export const QUALITY_CORPUS_HASH =
  "sha256:4f127b6363ac572968c31a4d32c4ddfbde1fbeca916a75d6720abf15cca87532" as const;

export const NATIVE_REVIEW_DIMENSIONS = [
  "naturalness",
  "clarity",
  "personalization",
  "nuance",
  "balance",
  "usefulness",
  "tradition_honesty",
  "tone",
  "navigation",
  "value_for_money",
] as const;

export type NativeReviewDimension = (typeof NATIVE_REVIEW_DIMENSIONS)[number];
export type QualityLocale = SupportedReportLocale;
export type QualityScenario = "ordinary" | "adversarial";
export type QualityOutcome =
  | "verified"
  | "ordinary_failure"
  | "expected_adversarial_rejection"
  | "adversarial_failure"
  | "unsupported_locale";

const FROZEN_SUBJECT_INVENTORY = Object.freeze(
  SUPPORTED_REPORT_LOCALES.flatMap((locale) => {
    const prefix = locale.slice(0, 2).toUpperCase();
    return Array.from({ length: 20 }, (_, index) => ({
      expectedScenario: index >= 15 ? ("adversarial" as const) : ("ordinary" as const),
      locale,
      subjectId: `SYN-${prefix}-${String(index + 1).padStart(3, "0")}`,
    }));
  }),
);

export interface QualityVersions {
  readonly assessmentSchema: typeof QUALITY_ASSESSMENT_SCHEMA_VERSION;
  readonly artifactSchema: typeof QUALITY_ARTIFACT_SCHEMA_VERSION;
  readonly engine: typeof ENGINE_VERSION;
  readonly evaluationRunner: typeof EVALUATION_RUNNER_VERSION;
  readonly formulaManifest: typeof FORMULA_MANIFEST_HASH;
  readonly localePack: string;
  readonly planner: typeof REPORT_PLANNER_VERSION;
  readonly plannerSchema: typeof REPORT_PLAN_SCHEMA_VERSION;
  readonly renderer: string;
  readonly reportSchema: typeof STRUCTURED_REPORT_SCHEMA_VERSION;
  readonly safetyPolicy: string;
  readonly verificationSchema: typeof REPORT_VERIFICATION_SCHEMA_VERSION;
  readonly verifier: string;
  readonly writer: string;
  readonly writerPolicy: string;
}

export interface QualityOutcomeRecord {
  readonly actualStatus: "rejected" | "unsupported_locale" | "verified";
  readonly diagnosticCodes: readonly string[];
  readonly expectedScenario: QualityScenario;
  readonly inputHash: string | null;
  readonly locale: QualityLocale;
  readonly outcome: QualityOutcome;
  readonly reportHash: string | null;
  readonly subjectId: string;
}

export interface QualityArtifact {
  readonly artifactHash: string;
  readonly corpusHash: string;
  readonly doctrineReleaseContentHash: string;
  readonly doctrineReleaseHash: string;
  readonly doctrineReleaseId: string;
  readonly outcomes: readonly QualityOutcomeRecord[];
  readonly requestedLocales: readonly QualityLocale[];
  readonly schemaVersion: typeof QUALITY_ARTIFACT_SCHEMA_VERSION;
  readonly versions: QualityVersions;
}

export interface NativeReview {
  readonly artifactHash: string;
  readonly factualFlag: boolean;
  readonly locale: QualityLocale;
  readonly reviewHash: string;
  readonly reviewedAt: string;
  readonly reviewedReportHashes: readonly string[];
  readonly reviewerId: string;
  readonly safetyFlag: boolean;
  readonly scores: Readonly<Record<NativeReviewDimension, number>>;
  readonly notes?: string;
}

export interface QualityAutomatedSummary {
  readonly acceptanceRate: number;
  readonly adversarialPassed: number;
  readonly adversarialTotal: number;
  readonly counts: {
    readonly adversarialFailure: number;
    readonly expectedAdversarialRejection: number;
    readonly ordinaryFailure: number;
    readonly unsupportedLocale: number;
    readonly verified: number;
  };
  readonly criticalCorrectnessRate: number;
  readonly criticalPassed: number;
  readonly criticalTotal: number;
  readonly ordinaryPassed: number;
  readonly ordinaryTotal: number;
  readonly passed: number;
  readonly total: number;
}

export interface QualityNativeSummary {
  readonly eligible: boolean;
  readonly mean: number | null;
  readonly requiredLocales: readonly QualityLocale[];
  readonly reviews: readonly NativeReview[];
}

export interface QualityAssessment {
  readonly artifact: QualityArtifact;
  readonly assessmentHash: string;
  readonly automated: QualityAutomatedSummary;
  readonly blockers: readonly string[];
  readonly eligible: boolean;
  readonly nativeReview: QualityNativeSummary;
  readonly policyVersion: typeof QUALITY_POLICY_VERSION;
  readonly schemaVersion: typeof QUALITY_ASSESSMENT_SCHEMA_VERSION;
}

export interface ReportQualityInput {
  readonly corpus: unknown;
  readonly release: unknown;
  readonly requestedLocales: readonly string[];
  readonly reviews?: unknown;
}

export interface QualityReviewPacketReport {
  readonly locale: QualityLocale;
  readonly report: StructuredReport;
  readonly reportHash: string;
  readonly subjectId: string;
}

export interface QualityReviewPacket {
  readonly artifactHash: string;
  readonly corpusHash: string;
  readonly doctrineReleaseContentHash: string;
  readonly doctrineReleaseHash: string;
  readonly doctrineReleaseId: string;
  readonly packetHash: string;
  readonly reports: readonly QualityReviewPacketReport[];
  readonly requestedLocales: readonly QualityLocale[];
  readonly schemaVersion: typeof QUALITY_REVIEW_PACKET_SCHEMA_VERSION;
  readonly versions: QualityVersions;
}

export interface ReleaseDecisionRequest {
  readonly action: "promote" | "rollback";
  readonly corpus: unknown;
  readonly history: readonly QualityHistoryEntry[];
  readonly release: unknown;
  readonly requestedLocales: readonly string[];
  readonly reviews?: unknown;
  readonly target: {
    readonly artifactHash: string;
    readonly locales: readonly string[];
  };
}

export interface QualityHistoryEntry {
  readonly approved?: boolean;
  readonly approvedAt?: string;
  readonly artifact: QualityArtifact;
  readonly assessment: QualityAssessment;
}

export interface ReleaseDecisionResult {
  readonly action: "blocked" | "promote" | "rollback";
  readonly assessed: QualityAssessment;
  readonly blockers: readonly string[];
  readonly eligible: boolean;
  readonly selectedArtifactHash: string | null;
}

export class QualityInputError extends RangeError {
  public constructor(
    public readonly code: string,
    detail?: string,
  ) {
    super(detail === undefined ? code : `${code}: ${detail}`);
    this.name = "QualityInputError";
  }
}

const hashSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const localeSchema = z.enum(SUPPORTED_REPORT_LOCALES);
const instantSchema = z.string().refine((value) => {
  const parsed = new Date(value);
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value) &&
    !Number.isNaN(parsed.valueOf()) &&
    parsed.toISOString() === value
  );
}, "Expected a canonical UTC instant.");

const versionsSchema = z.strictObject({
  assessmentSchema: z.literal(QUALITY_ASSESSMENT_SCHEMA_VERSION),
  artifactSchema: z.literal(QUALITY_ARTIFACT_SCHEMA_VERSION),
  engine: z.literal(ENGINE_VERSION),
  evaluationRunner: z.string().min(1),
  formulaManifest: z.literal(FORMULA_MANIFEST_HASH),
  localePack: z.string().min(1),
  planner: z.string().min(1),
  plannerSchema: z.string().min(1),
  renderer: z.string().min(1),
  reportSchema: z.string().min(1),
  safetyPolicy: z.string().min(1),
  verificationSchema: z.string().min(1),
  verifier: z.string().min(1),
  writer: z.string().min(1),
  writerPolicy: z.string().min(1),
});

const outcomeSchema = z.strictObject({
  actualStatus: z.enum(["rejected", "unsupported_locale", "verified"]),
  diagnosticCodes: z.array(z.string().regex(/^[A-Z][A-Z0-9_]*$/u)),
  expectedScenario: z.enum(["ordinary", "adversarial"]),
  inputHash: hashSchema.nullable(),
  locale: localeSchema,
  outcome: z.enum([
    "verified",
    "ordinary_failure",
    "expected_adversarial_rejection",
    "adversarial_failure",
    "unsupported_locale",
  ]),
  reportHash: hashSchema.nullable(),
  subjectId: z.string().regex(/^SYN-(?:EN|HI|OR)-\d{3}$/u),
});

const artifactSchema = z.strictObject({
  artifactHash: hashSchema,
  corpusHash: hashSchema,
  doctrineReleaseContentHash: hashSchema,
  doctrineReleaseHash: hashSchema,
  doctrineReleaseId: z.string().min(1),
  outcomes: z.array(outcomeSchema).length(60),
  requestedLocales: z.array(localeSchema).min(1),
  schemaVersion: z.literal(QUALITY_ARTIFACT_SCHEMA_VERSION),
  versions: versionsSchema,
});

const scoresSchema = z.strictObject({
  naturalness: z.number().finite().min(1).max(5),
  clarity: z.number().finite().min(1).max(5),
  personalization: z.number().finite().min(1).max(5),
  nuance: z.number().finite().min(1).max(5),
  balance: z.number().finite().min(1).max(5),
  usefulness: z.number().finite().min(1).max(5),
  tradition_honesty: z.number().finite().min(1).max(5),
  tone: z.number().finite().min(1).max(5),
  navigation: z.number().finite().min(1).max(5),
  value_for_money: z.number().finite().min(1).max(5),
});

const nativeReviewSchema = z.strictObject({
  artifactHash: hashSchema,
  factualFlag: z.boolean(),
  locale: localeSchema,
  notes: z.string().max(1000).optional(),
  reviewHash: hashSchema.optional(),
  reviewedAt: instantSchema,
  reviewedReportHashes: z.array(hashSchema),
  reviewerId: z.string().trim().min(1).max(160),
  safetyFlag: z.boolean(),
  scores: scoresSchema,
});
const sealedNativeReviewSchema = nativeReviewSchema.extend({ reviewHash: hashSchema });

const countsSchema = z.strictObject({
  adversarialFailure: z.number().int().nonnegative(),
  expectedAdversarialRejection: z.number().int().nonnegative(),
  ordinaryFailure: z.number().int().nonnegative(),
  unsupportedLocale: z.number().int().nonnegative(),
  verified: z.number().int().nonnegative(),
});

const automatedSchema = z.strictObject({
  acceptanceRate: z.number().finite().min(0).max(1),
  adversarialPassed: z.number().int().nonnegative(),
  adversarialTotal: z.number().int().nonnegative(),
  counts: countsSchema,
  criticalCorrectnessRate: z.number().finite().min(0).max(1),
  criticalPassed: z.number().int().nonnegative(),
  criticalTotal: z.number().int().nonnegative(),
  ordinaryPassed: z.number().int().nonnegative(),
  ordinaryTotal: z.number().int().nonnegative(),
  passed: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});

const nativeSummarySchema = z.strictObject({
  eligible: z.boolean(),
  mean: z.number().finite().min(1).max(5).nullable(),
  requiredLocales: z.array(localeSchema).min(1),
  reviews: z.array(sealedNativeReviewSchema),
});

const assessmentSchema = z.strictObject({
  artifact: artifactSchema,
  assessmentHash: hashSchema,
  automated: automatedSchema,
  blockers: z.array(z.string().regex(/^[A-Z][A-Za-z0-9_:.-]*$/u)),
  eligible: z.boolean(),
  nativeReview: nativeSummarySchema,
  policyVersion: z.literal(QUALITY_POLICY_VERSION),
  schemaVersion: z.literal(QUALITY_ASSESSMENT_SCHEMA_VERSION),
});

const targetSchema = z.strictObject({
  artifactHash: hashSchema,
  locales: z.array(localeSchema).min(1),
});

const historySchema = z.strictObject({
  approved: z.boolean().optional(),
  approvedAt: instantSchema.optional(),
  artifact: z.unknown(),
  assessment: z.unknown(),
});

const requestSchema = z.strictObject({
  action: z.enum(["promote", "rollback"]),
  corpus: z.unknown(),
  history: z.array(historySchema),
  release: z.unknown(),
  requestedLocales: z.array(localeSchema).min(1),
  reviews: z.unknown().optional(),
  target: targetSchema,
});

const versions: QualityVersions = Object.freeze({
  assessmentSchema: QUALITY_ASSESSMENT_SCHEMA_VERSION,
  artifactSchema: QUALITY_ARTIFACT_SCHEMA_VERSION,
  engine: ENGINE_VERSION,
  evaluationRunner: EVALUATION_RUNNER_VERSION,
  formulaManifest: FORMULA_MANIFEST_HASH,
  localePack: DETERMINISTIC_LOCALE_PACK_VERSION,
  planner: REPORT_PLANNER_VERSION,
  plannerSchema: REPORT_PLAN_SCHEMA_VERSION,
  renderer: REPORT_RENDERER_VERSION,
  reportSchema: STRUCTURED_REPORT_SCHEMA_VERSION,
  safetyPolicy: REPORT_SAFETY_POLICY_VERSION,
  verificationSchema: REPORT_VERIFICATION_SCHEMA_VERSION,
  verifier: REPORT_VERIFIER_VERSION,
  writer: DETERMINISTIC_WRITER_VERSION,
  writerPolicy: DETERMINISTIC_WRITER_POLICY_VERSION,
});

function inputError(code: string, error: unknown): QualityInputError {
  const detail = error instanceof Error ? error.message : String(error);
  return new QualityInputError(code, detail);
}

function uniqueLocales(input: readonly string[], code: string): readonly QualityLocale[] {
  if (input.length === 0) throw new QualityInputError(code, "at least one locale is required");
  const parsed = input.map((locale) => {
    const result = localeSchema.safeParse(locale);
    if (!result.success) throw new QualityInputError(code, String(locale));
    return result.data;
  });
  if (new Set(parsed).size !== parsed.length) {
    throw new QualityInputError(code, "requested locales must be unique");
  }
  return [...parsed].sort();
}

function expectedScenario(subject: EvaluationSubject): QualityScenario {
  return subject.adversarialText === null ? "ordinary" : "adversarial";
}

const RELEVANT_ADVERSARIAL_CODES = new Set([
  "REPORT_CLAIM_SENTENCE_NOT_BOUND",
  "REPORT_LOCALE_SCRIPT_MISMATCH",
  "REPORT_NUMBER_NOT_ALLOWED",
  "REPORT_SENTENCE_PROVENANCE_INVALID",
  "REPORT_UNSAFE_LANGUAGE",
]);
function hasMeaningfulAdversarialDetection(diagnosticCodes: readonly string[]): boolean {
  return (
    diagnosticCodes.length > 0 &&
    diagnosticCodes.some((code) => RELEVANT_ADVERSARIAL_CODES.has(code)) &&
    diagnosticCodes.every((code) => RELEVANT_ADVERSARIAL_CODES.has(code))
  );
}

function outcomeFor(subject: EvaluationSubject, execution: EvaluationExecution): QualityOutcome {
  const { result } = execution;
  if (result.status === "unsupported_locale") return "unsupported_locale";
  if (subject.adversarialText === null) {
    return result.status === "verified" ? "verified" : "ordinary_failure";
  }
  if (result.status === "rejected" && hasMeaningfulAdversarialDetection(result.diagnosticCodes)) {
    return "expected_adversarial_rejection";
  }
  return "adversarial_failure";
}

function releaseIdentity(release: unknown): {
  readonly contentHash: string;
  readonly hash: string;
  readonly id: string;
} {
  if (release === null || typeof release !== "object" || Array.isArray(release)) {
    throw new QualityInputError("QUALITY_RELEASE_INVALID", "object required");
  }
  const value = release as Record<string, unknown>;
  if (typeof value.release_hash !== "string" || typeof value.release_id !== "string") {
    throw new QualityInputError("QUALITY_RELEASE_INVALID", "release identity is missing");
  }
  return {
    contentHash: canonicalHash(release),
    hash: value.release_hash,
    id: value.release_id,
  };
}

function makeArtifact(
  corpusInput: unknown,
  releaseInput: unknown,
  requestedLocalesInput: readonly string[],
): {
  readonly artifact: QualityArtifact;
  readonly executions: readonly EvaluationExecution[];
  readonly subjects: readonly EvaluationSubject[];
} {
  const requestedLocales = uniqueLocales(
    requestedLocalesInput,
    "QUALITY_REQUESTED_LOCALES_INVALID",
  );
  const identity = releaseIdentity(releaseInput);
  let subjects: readonly EvaluationSubject[];
  try {
    subjects = parseEvaluationCorpus(corpusInput);
  } catch (error) {
    throw inputError("QUALITY_CORPUS_INVALID", error);
  }
  let executions: readonly EvaluationExecution[];
  try {
    executions = runEvaluationCorpusWithReports(corpusInput, releaseInput);
  } catch (error) {
    throw inputError("QUALITY_EVALUATION_INVALID", error);
  }
  const outcomes = subjects.map((subject, index) => {
    const execution = executions[index];
    if (execution === undefined) throw new QualityInputError("QUALITY_EVALUATION_INCOMPLETE");
    const result = execution.result;
    return {
      actualStatus: result.status,
      diagnosticCodes: [...result.diagnosticCodes].sort(),
      expectedScenario: expectedScenario(subject),
      inputHash: result.inputHash,
      locale: subject.locale,
      outcome: outcomeFor(subject, execution),
      reportHash: result.reportHash,
      subjectId: subject.subjectId,
    } satisfies QualityOutcomeRecord;
  });
  const content: Omit<QualityArtifact, "artifactHash"> = {
    corpusHash: canonicalHash(subjects),
    doctrineReleaseContentHash: identity.contentHash,
    doctrineReleaseHash: identity.hash,
    doctrineReleaseId: identity.id,
    outcomes: [...outcomes].sort((left, right) => compareText(left.subjectId, right.subjectId)),
    requestedLocales,
    schemaVersion: QUALITY_ARTIFACT_SCHEMA_VERSION,
    versions,
  };
  const artifact = deepFreeze({ ...content, artifactHash: canonicalHash(content) });
  return { artifact, executions, subjects };
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function selectRequested(artifact: QualityArtifact): readonly QualityOutcomeRecord[] {
  const locales = new Set(artifact.requestedLocales);
  return artifact.outcomes.filter((outcome) => locales.has(outcome.locale));
}

function summarizeAutomated(artifact: QualityArtifact): QualityAutomatedSummary {
  const selected = selectRequested(artifact);
  const counts = {
    adversarialFailure: selected.filter((item) => item.outcome === "adversarial_failure").length,
    expectedAdversarialRejection: selected.filter(
      (item) => item.outcome === "expected_adversarial_rejection",
    ).length,
    ordinaryFailure: selected.filter((item) => item.outcome === "ordinary_failure").length,
    unsupportedLocale: selected.filter((item) => item.outcome === "unsupported_locale").length,
    verified: selected.filter((item) => item.outcome === "verified").length,
  };
  const ordinaryTotal = selected.filter((item) => item.expectedScenario === "ordinary").length;
  const ordinaryPassed = counts.verified;
  const adversarialTotal = selected.filter(
    (item) => item.expectedScenario === "adversarial",
  ).length;
  const adversarialPassed = counts.expectedAdversarialRejection;
  const passed = ordinaryPassed + adversarialPassed;
  const total = selected.length;
  return {
    acceptanceRate: passed / total,
    adversarialPassed,
    adversarialTotal,
    counts,
    criticalCorrectnessRate: passed / total,
    criticalPassed: passed,
    criticalTotal: total,
    ordinaryPassed,
    ordinaryTotal,
    passed,
    total,
  };
}

function reviewContent(review: NativeReview): Omit<NativeReview, "reviewHash"> {
  const { reviewHash: _reviewHash, ...content } = review;
  return content;
}

function parseReviewInput(input: unknown): readonly NativeReview[] {
  if (input === undefined) return [];
  const parsed = z.array(nativeReviewSchema).safeParse(input);
  if (!parsed.success) throw inputError("QUALITY_NATIVE_REVIEW_INVALID", parsed.error);
  const reviews = parsed.data.map((candidate) => ({
    ...candidate,
    reviewHash:
      candidate.reviewHash ??
      canonicalHash((({ reviewHash: _reviewHash, ...content }) => content)(candidate)),
  })) as NativeReview[];
  const locales = reviews.map((review) => review.locale);
  if (new Set(locales).size !== locales.length) {
    throw new QualityInputError("QUALITY_NATIVE_REVIEW_DUPLICATE_LOCALE");
  }
  for (const review of reviews) {
    if (canonicalHash(reviewContent(review)) !== review.reviewHash) {
      throw new QualityInputError("QUALITY_NATIVE_REVIEW_HASH_MISMATCH", review.locale);
    }
    if (
      new Set(review.reviewedReportHashes).size !== review.reviewedReportHashes.length ||
      [...review.reviewedReportHashes]
        .sort()
        .some((hash, index) => hash !== review.reviewedReportHashes[index])
    ) {
      throw new QualityInputError("QUALITY_NATIVE_REVIEW_HASH_ORDER_INVALID", review.locale);
    }
  }
  return deepFreeze(reviews);
}

function summarizeNative(
  artifact: QualityArtifact,
  reviewsInput: unknown,
): QualityNativeSummary & { readonly blockers: readonly string[] } {
  const reviews = parseReviewInput(reviewsInput);
  const blockers: string[] = [];
  const selected = selectRequested(artifact);
  for (const review of reviews) {
    if (!artifact.requestedLocales.includes(review.locale)) {
      throw new QualityInputError("QUALITY_NATIVE_REVIEW_LOCALE_UNREQUESTED", review.locale);
    }
    if (review.artifactHash !== artifact.artifactHash) {
      throw new QualityInputError("QUALITY_NATIVE_REVIEW_ARTIFACT_MISMATCH", review.locale);
    }
    const expectedHashes = selected
      .filter(
        (item) =>
          item.locale === review.locale &&
          item.expectedScenario === "ordinary" &&
          item.outcome === "verified" &&
          item.reportHash !== null,
      )
      .map((item) => item.reportHash as string)
      .sort();
    if (expectedHashes.length === 0) {
      blockers.push(`QUALITY_NATIVE_REVIEW_COVERAGE_EMPTY:${review.locale}`);
    }
    if (!sameStrings(expectedHashes, review.reviewedReportHashes)) {
      throw new QualityInputError("QUALITY_NATIVE_REVIEW_COVERAGE_MISMATCH", review.locale);
    }
  }
  const means: number[] = [];
  for (const locale of artifact.requestedLocales) {
    const review = reviews.find((candidate) => candidate.locale === locale);
    if (review === undefined) {
      blockers.push(`QUALITY_NATIVE_REVIEW_MISSING:${locale}`);
      continue;
    }
    means.push(...NATIVE_REVIEW_DIMENSIONS.map((dimension) => review.scores[dimension]));
    if (review.factualFlag || review.safetyFlag) {
      blockers.push(`QUALITY_NATIVE_REVIEW_FLAGGED:${locale}`);
    }
    if (NATIVE_REVIEW_DIMENSIONS.some((dimension) => review.scores[dimension] < 4)) {
      blockers.push(`QUALITY_NATIVE_REVIEW_DIMENSION_BELOW_4:${locale}`);
    }
  }
  const mean =
    means.length === 0 ? null : means.reduce((sum, value) => sum + value, 0) / means.length;
  if (mean === null || mean < 4.2) blockers.push("QUALITY_NATIVE_REVIEW_MEAN_BELOW_4_2");
  for (const locale of artifact.requestedLocales) {
    const review = reviews.find((candidate) => candidate.locale === locale);
    if (review === undefined) continue;
    const localeMean =
      NATIVE_REVIEW_DIMENSIONS.reduce((sum, dimension) => sum + review.scores[dimension], 0) /
      NATIVE_REVIEW_DIMENSIONS.length;
    if (localeMean < 4.2) blockers.push(`QUALITY_NATIVE_REVIEW_MEAN_BELOW_4_2:${locale}`);
  }
  return {
    blockers,
    eligible: blockers.length === 0,
    mean,
    requiredLocales: artifact.requestedLocales,
    reviews,
  };
}

function summarizeBlockers(
  artifact: QualityArtifact,
  automated: QualityAutomatedSummary,
  native: QualityNativeSummary & { readonly blockers: readonly string[] },
): readonly string[] {
  const blockers: string[] = [];
  if (artifact.corpusHash !== QUALITY_CORPUS_HASH) {
    blockers.push("QUALITY_CORPUS_IDENTITY_MISMATCH");
  }
  if (automated.criticalCorrectnessRate < 1) {
    blockers.push("QUALITY_CRITICAL_CORRECTNESS_BELOW_100");
  }
  if (automated.acceptanceRate < 0.98) {
    blockers.push("QUALITY_AUTOMATED_ACCEPTANCE_BELOW_98");
  }
  if (automated.counts.ordinaryFailure > 0) blockers.push("QUALITY_ORDINARY_SUBJECT_FAILURE");
  if (automated.counts.adversarialFailure > 0) {
    blockers.push("QUALITY_ADVERSARIAL_REJECTION_INVALID");
  }
  if (automated.counts.unsupportedLocale > 0) blockers.push("QUALITY_UNSUPPORTED_LOCALE");
  // These two CP7 measurements need reviewed content methodology that is not present in the
  // deterministic verifier. Keep them explicit and fail closed instead of treating a proxy as proof.
  blockers.push("QUALITY_CROSS_REPORT_OVERLAP_NOT_ASSESSED");
  blockers.push("QUALITY_GLOSSARY_COVERAGE_NOT_ASSESSED");
  blockers.push(...native.blockers);
  return [...new Set(blockers)].sort();
}

function makeAssessment(artifact: QualityArtifact, reviewsInput: unknown): QualityAssessment {
  const automated = summarizeAutomated(artifact);
  const native = summarizeNative(artifact, reviewsInput);
  const blockers = summarizeBlockers(artifact, automated, native);
  const content: Omit<QualityAssessment, "assessmentHash"> = {
    artifact,
    automated,
    blockers,
    eligible: blockers.length === 0,
    nativeReview: {
      eligible: native.eligible,
      mean: native.mean,
      requiredLocales: native.requiredLocales,
      reviews: native.reviews,
    },
    policyVersion: QUALITY_POLICY_VERSION,
    schemaVersion: QUALITY_ASSESSMENT_SCHEMA_VERSION,
  };
  return deepFreeze({ ...content, assessmentHash: canonicalHash(content) });
}

/** Replays the deterministic corpus and computes the fail-closed quality assessment. */
export function assessReportQuality(input: ReportQualityInput): QualityAssessment {
  if (input === null || typeof input !== "object") {
    throw new QualityInputError("QUALITY_INPUT_INVALID", "object required");
  }
  let made: ReturnType<typeof makeArtifact>;
  try {
    made = makeArtifact(input.corpus, input.release, input.requestedLocales);
  } catch (error) {
    if (error instanceof QualityInputError) throw error;
    throw inputError("QUALITY_EVALUATION_INVALID", error);
  }
  return makeAssessment(made.artifact, input.reviews);
}

/** Parses an artifact and verifies its self-hash and stable outcome ordering. */
export function parseQualityArtifact(input: unknown): QualityArtifact {
  const parsed = artifactSchema.safeParse(input);
  if (!parsed.success) throw inputError("QUALITY_ARTIFACT_INVALID", parsed.error);
  const artifact = parsed.data as QualityArtifact;
  if (artifact.corpusHash !== QUALITY_CORPUS_HASH) {
    throw new QualityInputError("QUALITY_ARTIFACT_CORPUS_UNTRUSTED");
  }
  if (JSON.stringify(artifact.versions) !== JSON.stringify(versions)) {
    throw new QualityInputError("QUALITY_ARTIFACT_VERSION_MISMATCH");
  }
  if (new Set(artifact.requestedLocales).size !== artifact.requestedLocales.length) {
    throw new QualityInputError("QUALITY_ARTIFACT_LOCALES_INVALID");
  }
  if (!sameStrings(artifact.requestedLocales, [...artifact.requestedLocales].sort())) {
    throw new QualityInputError("QUALITY_ARTIFACT_LOCALE_ORDER_INVALID");
  }
  const subjectById = new Map(
    FROZEN_SUBJECT_INVENTORY.map((subject) => [subject.subjectId, subject]),
  );
  if (
    artifact.outcomes.some((outcome) => {
      const subject = subjectById.get(outcome.subjectId);
      return (
        subject === undefined ||
        subject.locale !== outcome.locale ||
        subject.expectedScenario !== outcome.expectedScenario
      );
    }) ||
    new Set(artifact.outcomes.map((outcome) => outcome.subjectId)).size !==
      FROZEN_SUBJECT_INVENTORY.length
  ) {
    throw new QualityInputError("QUALITY_ARTIFACT_SUBJECT_INVENTORY_INVALID");
  }
  if (
    artifact.outcomes.some((outcome, index, all) => {
      const previous = all[index - 1];
      return index > 0 && previous !== undefined && previous.subjectId >= outcome.subjectId;
    })
  ) {
    throw new QualityInputError("QUALITY_ARTIFACT_OUTCOME_ORDER_INVALID");
  }
  if (
    artifact.outcomes.some((outcome) => {
      const relevantAdversarial = hasMeaningfulAdversarialDetection(outcome.diagnosticCodes);
      if (outcome.actualStatus === "unsupported_locale") {
        return (
          outcome.outcome !== "unsupported_locale" ||
          outcome.reportHash !== null ||
          outcome.diagnosticCodes.length === 0
        );
      }
      if (outcome.actualStatus === "verified") {
        return (
          outcome.outcome !==
            (outcome.expectedScenario === "ordinary" ? "verified" : "adversarial_failure") ||
          outcome.inputHash === null ||
          outcome.reportHash === null ||
          outcome.diagnosticCodes.length !== 0
        );
      }
      if (outcome.expectedScenario === "ordinary") {
        return (
          outcome.outcome !== "ordinary_failure" ||
          outcome.reportHash !== null ||
          outcome.diagnosticCodes.length === 0
        );
      }
      return (
        outcome.reportHash !== null ||
        outcome.diagnosticCodes.length === 0 ||
        outcome.outcome !==
          (relevantAdversarial ? "expected_adversarial_rejection" : "adversarial_failure")
      );
    })
  ) {
    throw new QualityInputError("QUALITY_ARTIFACT_OUTCOME_SEMANTICS_INVALID");
  }
  if (
    artifact.outcomes.some(
      (outcome) =>
        new Set(outcome.diagnosticCodes).size !== outcome.diagnosticCodes.length ||
        outcome.diagnosticCodes.some((code, index, codes) => {
          const previous = codes[index - 1];
          return index > 0 && previous !== undefined && previous >= code;
        }),
    )
  ) {
    throw new QualityInputError("QUALITY_ARTIFACT_DIAGNOSTICS_ORDER_INVALID");
  }
  const { artifactHash: _artifactHash, ...content } = artifact;
  if (canonicalHash(content) !== artifact.artifactHash) {
    throw new QualityInputError("QUALITY_ARTIFACT_HASH_MISMATCH");
  }
  return deepFreeze(artifact);
}

/** Parses a quality assessment and recomputes its derived summaries before accepting it. */
export function parseQualityAssessment(input: unknown): QualityAssessment {
  const parsed = assessmentSchema.safeParse(input);
  if (!parsed.success) throw inputError("QUALITY_ASSESSMENT_INVALID", parsed.error);
  const assessment = parsed.data as QualityAssessment;
  const artifact = parseQualityArtifact(assessment.artifact);
  if (!sameStrings(assessment.nativeReview.requiredLocales, artifact.requestedLocales)) {
    throw new QualityInputError("QUALITY_ASSESSMENT_NATIVE_LOCALES_MISMATCH");
  }
  const automated = summarizeAutomated(artifact);
  if (JSON.stringify(automated) !== JSON.stringify(assessment.automated)) {
    throw new QualityInputError("QUALITY_ASSESSMENT_AUTOMATED_MISMATCH");
  }
  const native = summarizeNative(artifact, assessment.nativeReview.reviews);
  if (
    assessment.nativeReview.mean !== native.mean ||
    assessment.nativeReview.eligible !== native.eligible
  ) {
    throw new QualityInputError("QUALITY_ASSESSMENT_NATIVE_MISMATCH");
  }
  const blockers = summarizeBlockers(artifact, automated, native);
  if (JSON.stringify(blockers) !== JSON.stringify(assessment.blockers)) {
    throw new QualityInputError("QUALITY_ASSESSMENT_BLOCKERS_MISMATCH");
  }
  if (assessment.eligible !== (blockers.length === 0)) {
    throw new QualityInputError("QUALITY_ASSESSMENT_ELIGIBILITY_MISMATCH");
  }
  const { assessmentHash: _assessmentHash, ...content } = assessment;
  if (canonicalHash(content) !== assessment.assessmentHash) {
    throw new QualityInputError("QUALITY_ASSESSMENT_HASH_MISMATCH");
  }
  return deepFreeze(assessment);
}

/** Emits the exact ordinary verified report bodies a native reviewer is allowed to inspect. */
export function buildReportQualityReviewPacket(input: {
  readonly corpus: unknown;
  readonly release: unknown;
  readonly requestedLocales?: readonly string[];
}): QualityReviewPacket {
  const requestedLocales = input.requestedLocales ?? SUPPORTED_REPORT_LOCALES;
  const made = makeArtifact(input.corpus, input.release, requestedLocales);
  const artifact = made.artifact;
  const reports: QualityReviewPacketReport[] = [];
  for (const [index, subject] of made.subjects.entries()) {
    const execution = made.executions[index];
    if (
      execution?.report === undefined ||
      subject.adversarialText !== null ||
      execution.result.status !== "verified" ||
      !artifact.requestedLocales.includes(subject.locale)
    ) {
      continue;
    }
    reports.push({
      locale: subject.locale,
      report: execution.report,
      reportHash: execution.result.reportHash as string,
      subjectId: subject.subjectId,
    });
  }
  reports.sort((left, right) => compareText(left.subjectId, right.subjectId));
  const content: Omit<QualityReviewPacket, "packetHash"> = {
    artifactHash: artifact.artifactHash,
    corpusHash: artifact.corpusHash,
    doctrineReleaseContentHash: artifact.doctrineReleaseContentHash,
    doctrineReleaseHash: artifact.doctrineReleaseHash,
    doctrineReleaseId: artifact.doctrineReleaseId,
    reports,
    requestedLocales: artifact.requestedLocales,
    schemaVersion: QUALITY_REVIEW_PACKET_SCHEMA_VERSION,
    versions: artifact.versions,
  };
  return deepFreeze({ ...content, packetHash: canonicalHash(content) });
}

function parseRequest(input: unknown): ReleaseDecisionRequest {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) throw inputError("QUALITY_RELEASE_REQUEST_INVALID", parsed.error);
  const value = parsed.data;
  const requestedLocales = uniqueLocales(
    value.requestedLocales,
    "QUALITY_REQUESTED_LOCALES_INVALID",
  );
  const targetLocales = uniqueLocales(value.target.locales, "QUALITY_TARGET_LOCALES_INVALID");
  if (!sameStrings(requestedLocales, targetLocales)) {
    throw new QualityInputError("QUALITY_TARGET_LOCALES_MISMATCH");
  }
  const history = value.history.map((entry) => ({
    ...(entry.approved === undefined ? {} : { approved: entry.approved }),
    ...(entry.approvedAt === undefined ? {} : { approvedAt: entry.approvedAt }),
    artifact: parseQualityArtifact(entry.artifact),
    assessment: parseQualityAssessment(entry.assessment),
  }));
  return {
    action: value.action,
    corpus: value.corpus,
    history,
    release: value.release,
    requestedLocales,
    ...(value.reviews === undefined ? {} : { reviews: value.reviews }),
    target: { artifactHash: value.target.artifactHash, locales: targetLocales },
  };
}

/** Makes a release decision from a fresh replay; no caller-provided assessment is trusted. */
export function decideRelease(input: unknown): ReleaseDecisionResult {
  const request = parseRequest(input);
  const assessed = assessReportQuality({
    corpus: request.corpus,
    release: request.release,
    requestedLocales: request.requestedLocales,
    ...(request.reviews === undefined ? {} : { reviews: request.reviews }),
  });
  if (request.action === "promote") {
    const blockers = [...assessed.blockers];
    if (request.target.artifactHash !== assessed.artifact.artifactHash) {
      blockers.push("QUALITY_PROMOTION_TARGET_MISMATCH");
    }
    if (!assessed.eligible) {
      return deepFreeze({
        action: "blocked",
        assessed,
        blockers: [...new Set(blockers)].sort(),
        eligible: false,
        selectedArtifactHash: null,
      });
    }
    return deepFreeze({
      action: "promote",
      assessed,
      blockers: [],
      eligible: true,
      selectedArtifactHash: assessed.artifact.artifactHash,
    });
  }

  const historyEntry =
    assessed.eligible === false
      ? undefined
      : request.history.find(
          (entry) =>
            entry.approved === true &&
            entry.assessment.eligible &&
            entry.artifact.artifactHash === request.target.artifactHash &&
            entry.artifact.artifactHash === assessed.artifact.artifactHash &&
            sameStrings(entry.artifact.requestedLocales, request.requestedLocales) &&
            entry.assessment.artifact.artifactHash === entry.artifact.artifactHash,
        );
  if (historyEntry === undefined) {
    return deepFreeze({
      action: "blocked",
      assessed,
      blockers: [
        ...new Set([
          ...assessed.blockers,
          "QUALITY_ROLLBACK_HISTORY_NOT_ELIGIBLE",
          ...(assessed.eligible ? [] : ["QUALITY_ROLLBACK_REPLAY_NOT_ELIGIBLE"]),
        ]),
      ].sort(),
      eligible: false,
      selectedArtifactHash: null,
    });
  }
  return deepFreeze({
    action: "rollback",
    assessed,
    blockers: [],
    eligible: true,
    selectedArtifactHash: historyEntry.artifact.artifactHash,
  });
}
