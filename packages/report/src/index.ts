export { EDITORIAL_SECTIONS, REPORT_SECTION_KEYS } from "@numerology/doctrine";
export type { ReportSectionKey } from "@numerology/doctrine";
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
  writeDeterministicReport,
  DeterministicWriterError,
  type DeterministicReportInput,
} from "./deterministic-writer";
export {
  EVALUATION_SCENARIO_TAGS,
  evaluationCorpusSchema,
  parseEvaluationCorpus,
  type EvaluationScenarioTag,
  type EvaluationSubject,
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
export {
  createStructuredReport,
  hasValidStructuredReportHash,
  rehashStructuredReport,
  stableStructuredReport,
  type StructuredReportWithoutHash,
} from "./report-serialization";
export { renderStructuredReportHtml } from "./report-renderer";
export {
  parseStructuredReport,
  reportBlockSchema,
  reportSectionSchema,
  reportVersionsSchema,
  structuredClaimSchema,
  structuredReportSchema,
  STRUCTURED_REPORT_DISCLAIMER_KEY,
  STRUCTURED_REPORT_SCHEMA_VERSION,
  SUPPORTED_REPORT_LOCALES,
  type ReportBlock,
  type ReportSection,
  type ReportVersions,
  type StructuredClaim,
  type StructuredReport,
  type SupportedReportLocale,
} from "./structured-report";
export { DEFAULT_PLANNER_POLICY } from "./policy";
export { stableReportPlan } from "./serialization";
export {
  REPORT_PLAN_SCHEMA_VERSION,
  REPORT_PLANNER_VERSION,
  ReportPlanningError,
} from "./types";
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
export { validateReportPlan } from "./validation";
export {
  parseReportVerificationRecord,
  reportVerificationRecordSchema,
  verificationDiagnosticSchema,
  verificationGateResultSchema,
  VERIFICATION_GATES,
  type ReportVerificationRecord,
  type VerificationDiagnostic,
  type VerificationGateName,
  type VerificationGateResult,
} from "./verification/types";
export {
  ReportVerificationContextError,
  stableVerificationRecord,
  verifyStructuredReport,
  type ReportVerificationInput,
} from "./verification/verifier";
export { renderReportPlan } from "./viewer";
