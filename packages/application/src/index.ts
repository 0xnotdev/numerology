export {
  createAuthenticatedReportIntentHandlers,
  type SessionRepository,
} from "./authenticated-report-intents";
export {
  createPrivateAccessHandlers,
  createPrivateAccessHttpHandlers,
  createPrivateAccessService,
  PrivateAccessIdempotencyConflictError,
  PrivateAccessNotFoundError,
  PrivateAccessReauthenticationRequiredError,
  type AccountReportSummary,
  type EntitledPrivateReportRecord,
  type PrivateAccessHttpHandlers,
  type PrivateAccessRepository,
  type PrivateAccessService,
  type PrivateAuditEventInput,
  type PrivateLifecycleAction,
  type PrivateLifecycleRequestReceipt,
} from "./private-access";
export { type Clock, systemClock } from "./clock";
export {
  createDraftCookie,
  type DraftCookiePayload,
  verifyDraftCookie,
} from "./draft-cookie";
export { createExpireReportIntents } from "./expire-report-intents";
export {
  FieldProtectionError,
  type FieldProtector,
  type FieldPurpose,
  PROTECTED_FIELD_FORMAT_VERSION,
  type ProtectedField,
  serializeProtectedField,
} from "./field-protection";
export { type IdGenerator, randomIdGenerator } from "./id-generator";
export { LocalEnvelopeFieldProtector } from "./local-envelope-field-protector";
export { createLocalFieldProtectorFromEnvironment } from "./local-field-protection-config";
export {
  createMagicLinkHttpHandlers,
  type MagicLinkHttpHandlers,
  type MagicLinkRepository,
  type MagicLinkSender,
} from "./magic-link";
export {
  createPrepaymentAnalyticsRecorder,
  type OptionalAnalyticsConsent,
  PREPAYMENT_ANALYTICS_EVENT_NAMES,
  PREPAYMENT_ANALYTICS_SCHEMA_VERSION,
  type PrepaymentAnalyticsDependencies,
  type PrepaymentAnalyticsEventRecord,
  type PrepaymentAnalyticsInput,
  type PrepaymentAnalyticsRecordResult,
  type PrepaymentAnalyticsRepository,
  parsePrepaymentAnalyticsInput,
} from "./prepayment-analytics";
export { createRateLimiter, type RateLimitDecision } from "./rate-limiter";
export type {
  CreateFixtureReadyReport,
  EncryptedReportSnapshots,
  FixtureReadyReportRecord,
  ReportGenerationRepository,
} from "./report-generation-repository";
export {
  type CompleteReportIntentCommandInput,
  type CreateReportIntentCommandInput,
  createReportIntentCommands,
  type IntentReadResult,
  type OwnedIntentInput,
  type PatchReportIntentCommandInput,
  type PreviewReportIntentCommandInput,
  type ReportIntentCommandDependencies,
  type ReportPreview,
} from "./report-intent-commands";
export {
  type CreateIdempotencyRequest,
  createDefaultReportIntentHttpDependencies,
  createReportIntentHttpHandlers,
  createReportIntentRouteHandlers,
  IdempotencyConflictError,
  IdempotencyExpiredError,
  IdempotencyInProgressError,
  type ReportIntentHttpDependencies,
  type ReportIntentHttpHandlers,
} from "./report-intent-http";
export type {
  CompleteReportIntent,
  CreateReportIntent,
  ExpireDueReportIntentDrafts,
  ReportIntentConsentEvidence,
  ReportIntentRecord,
  ReportIntentRepository,
  ReportIntentStatus,
  SaveReportIntentDraft,
  SupportedLocale,
} from "./report-intent-repository";
export {
  OptimisticConcurrencyError,
  ReportIntentNotFoundError,
} from "./report-intent-repository";
export { verifyCsrfToken } from "./request-guards";
export {
  createSessionAuthentication,
  DEFAULT_RECENT_AUTH_WINDOW_MS,
  PRIVATE_CSRF_COOKIE,
  PRIVATE_CSRF_HEADER,
  PRIVATE_SESSION_COOKIE,
  type AuthenticatedSession,
  type SessionAuthentication,
  type SessionRequestContext,
} from "./session-authentication";
export type { TransactionRunner } from "./transaction";
