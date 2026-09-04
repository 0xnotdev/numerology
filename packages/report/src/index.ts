export type { ReportSectionKey } from "@numerology/doctrine";
export { EDITORIAL_SECTIONS, REPORT_SECTION_KEYS } from "@numerology/doctrine";
export {
  buildCheckpointFourReportFixture,
  CHECKPOINT4_FIXTURE_DISPLAY_NAME,
  CHECKPOINT4_FIXTURE_GENERATED_AT,
  CHECKPOINT4_FIXTURE_REPORT_ID,
  CHECKPOINT4_FIXTURE_REQUEST,
  type CheckpointFourReportFixture,
} from "./checkpoint4-fixture";
export { REPORT_CLI_HELP, runReportCli } from "./cli";
export {
  type CustomerDeliveryBlock,
  type CustomerDeliveryProjection,
  type CustomerDeliverySection,
  customerDeliveryProjectionSchema,
  parseCustomerDeliveryProjection,
  projectCustomerDelivery,
  renderCustomerDeliveryHtml,
} from "./customer-delivery";
export {
  type DeterministicReportInput,
  DeterministicWriterError,
  writeDeterministicReport,
} from "./deterministic-writer";
export {
  EVALUATION_RUNNER_VERSION,
  type EvaluationExecution,
  type EvaluationResult,
  runEvaluationCorpus,
  runEvaluationCorpusWithReports,
} from "./evaluation";
export {
  EVALUATION_SCENARIO_TAGS,
  type EvaluationScenarioTag,
  type EvaluationSubject,
  evaluationCorpusSchema,
  parseEvaluationCorpus,
} from "./evaluation-corpus";
export {
  isReportClaimId,
  isReportId,
  isReportSectionId,
  parseReportClaimId,
  parseReportId,
  parseReportSectionId,
  type ReportClaimId,
  type ReportId,
  type ReportSectionId,
} from "./ids";
export { planReport } from "./planner";
export { DEFAULT_PLANNER_POLICY } from "./policy";
export {
  assessReportQuality,
  buildReportQualityReviewPacket,
  decideRelease,
  NATIVE_REVIEW_DIMENSIONS,
  type NativeReview,
  type NativeReviewDimension,
  parseQualityArtifact,
  parseQualityAssessment,
  QUALITY_ARTIFACT_SCHEMA_VERSION,
  QUALITY_ASSESSMENT_SCHEMA_VERSION,
  QUALITY_CORPUS_HASH,
  QUALITY_POLICY_VERSION,
  QUALITY_REVIEW_PACKET_SCHEMA_VERSION,
  type QualityArtifact,
  type QualityAssessment,
  type QualityAutomatedSummary,
  type QualityHistoryEntry,
  QualityInputError,
  type QualityLocale,
  type QualityNativeSummary,
  type QualityOutcome,
  type QualityOutcomeRecord,
  type QualityReviewPacket,
  type QualityReviewPacketReport,
  type QualityScenario,
  type QualityVersions,
  type ReleaseDecisionRequest,
  type ReleaseDecisionResult,
  type ReportQualityInput,
} from "./quality";
export { renderStructuredReportHtml } from "./report-renderer";
export {
  createStructuredReport,
  hasValidStructuredReportHash,
  rehashStructuredReport,
  type StructuredReportWithoutHash,
  stableStructuredReport,
} from "./report-serialization";
export { stableReportPlan } from "./serialization";
export {
  parseStructuredReport,
  type ReportBlock,
  type ReportSection,
  type ReportVersions,
  reportBlockSchema,
  reportSectionSchema,
  reportSentenceProvenanceSchema,
  reportVersionsSchema,
  type SentenceProvenance,
  STRUCTURED_REPORT_DISCLAIMER_KEY,
  STRUCTURED_REPORT_SCHEMA_VERSION,
  type StructuredClaim,
  type StructuredReport,
  SUPPORTED_REPORT_LOCALES,
  type SupportedReportLocale,
  structuredClaimSchema,
  structuredReportSchema,
} from "./structured-report";
export type {
  AppliedPlannerPolicy,
  ClaimRelationship,
  ClaimValence,
  FactLink,
  PlannedAction,
  PlannedClaim,
  PlannedSection,
  PlannerPolicy,
  PlanStatistics,
  PlanValidationResult,
  ReportPlan,
} from "./types";
export {
  REPORT_PLAN_SCHEMA_VERSION,
  REPORT_PLANNER_VERSION,
  ReportPlanningError,
} from "./types";
export { validateReportPlan } from "./validation";
export {
  checkLength,
  checkProseProvenance,
  checkRepetition,
} from "./verification/content-gates";
export {
  parseReportVerificationRecord,
  type ReportVerificationRecord,
  reportVerificationRecordSchema,
  VERIFICATION_GATES,
  type VerificationDiagnostic,
  type VerificationGateName,
  type VerificationGateResult,
  verificationDiagnosticSchema,
  verificationGateResultSchema,
} from "./verification/types";
export {
  ReportVerificationContextError,
  type ReportVerificationInput,
  stableVerificationRecord,
  verifyStructuredReport,
} from "./verification/verifier";
export { renderReportPlan } from "./viewer";
