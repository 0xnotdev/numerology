import {
  createAuthenticatedReportIntentHandlers,
  createReportIntentCommands,
  randomIdGenerator,
  systemClock,
  type FieldProtector,
  type IdGenerator,
  type ReportIntentHttpDependencies,
  type ReportIntentHttpHandlers,
} from "@numerology/application";
import { randomUUID } from "node:crypto";
import { createPostgresCreateIdempotency } from "@numerology/database/create-idempotency";
import type { DatabasePool } from "@numerology/database/pool";
import { createPostgresRateLimiter } from "@numerology/database/rate-limiter";
import { createReportIntentRepository } from "@numerology/database/report-intent-repository";
import { createPostgresSessionRepository } from "@numerology/database/session-repository";
import { createReportIntentRouteAdapters } from "./report-intent-routes";
import { PRIVACY_NOTICE_VERSION } from "../intake/privacy-notice";

const runtimeKey = Symbol.for("numerology.report-intent-runtime");
const privacyKey = Symbol.for("numerology.intake-privacy-runtime");
type RuntimeGlobal = typeof globalThis & {
  [runtimeKey]?: ReportIntentHttpHandlers;
  [privacyKey]?: ReviewedPrivacyConfiguration;
};

const EMAIL = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/u;
const PLACEHOLDER_DOMAIN = /(?:^|\.)(?:example|invalid|test)$/iu;

export interface ReviewedPrivacyConfiguration {
  readonly contactEmail: string;
  readonly controllerName: string;
  readonly noticeVersion: string;
  readonly reviewed: true;
}

export interface IntakePrivacyConfiguration {
  readonly contactEmail: string;
  readonly controllerName: string;
}

function validatePrivacy(value: ReviewedPrivacyConfiguration): void {
  if (
    value.reviewed !== true ||
    value.controllerName.trim().length === 0 ||
    value.controllerName.length > 200 ||
    value.noticeVersion.trim().length === 0 ||
    value.noticeVersion.length > 120 ||
    value.noticeVersion.includes("\0") ||
    value.noticeVersion !== PRIVACY_NOTICE_VERSION ||
    value.contactEmail.length > 254 ||
    !EMAIL.test(value.contactEmail)
  ) {
    throw new RangeError("PRIVACY_CONFIGURATION_INVALID");
  }
  const domain = value.contactEmail.slice(value.contactEmail.lastIndexOf("@") + 1);
  if (PLACEHOLDER_DOMAIN.test(domain)) throw new RangeError("PRIVACY_CONFIGURATION_UNREVIEWED");
}

function reviewedPrivacyFromEnvironment(
  environment: Record<string, string | undefined>,
): ReviewedPrivacyConfiguration | null {
  if (environment.PRIVACY_REVIEWED !== "true") return null;
  const controllerName = environment.PRIVACY_CONTROLLER_NAME;
  const contactEmail = environment.PRIVACY_CONTACT_EMAIL;
  const noticeVersion = environment.PRIVACY_NOTICE_VERSION;
  if (controllerName === undefined || contactEmail === undefined || noticeVersion === undefined) {
    return null;
  }
  const value = { contactEmail, controllerName, noticeVersion, reviewed: true as const };
  try {
    validatePrivacy(value);
    return value;
  } catch {
    return null;
  }
}

/** Public, non-secret identity/contact projection used by server-rendered intake pages. */
export function getIntakePrivacyConfiguration(): IntakePrivacyConfiguration | null {
  if (process.env.CUSTOMER_RUNTIME_ENABLED !== "true") return null;
  const configured = reviewedPrivacyFromEnvironment(process.env);
  if (configured === null) return null;
  return {
    contactEmail: configured.contactEmail,
    controllerName: configured.controllerName,
  };
}

export interface ReportIntentRuntimeOptions {
  readonly draftCookieSecret: string;
  readonly idGenerator?: IdGenerator;
  readonly origin: string;
  readonly pool: DatabasePool;
  readonly privacy: ReviewedPrivacyConfiguration;
  readonly protector: FieldProtector;
}

function validateRuntimeOptions(options: ReportIntentRuntimeOptions): void {
  if (options.draftCookieSecret.length < 32 || options.draftCookieSecret.length > 512) {
    throw new RangeError("REPORT_INTENT_COOKIE_SECRET_INVALID");
  }
  const origin = new URL(options.origin);
  if (origin.protocol !== "https:" || origin.origin !== options.origin) {
    throw new RangeError("REPORT_INTENT_ORIGIN_INVALID");
  }
  validatePrivacy(options.privacy);
}

/**
 * Composes the authenticated report-intent boundary from durable PostgreSQL adapters.
 *
 * No local field protector, process-memory limiter, anonymous owner, or other development
 * fallback is selected here. A deployment must supply its reviewed protection adapter explicitly.
 */
export function configureReportIntentRuntime(options: ReportIntentRuntimeOptions): void {
  validateRuntimeOptions(options);
  const idGenerator = options.idGenerator ?? randomIdGenerator;
  const clock = systemClock;
  const repository = createReportIntentRepository(options.pool);
  const commands = createReportIntentCommands({
    clock,
    idGenerator,
    protector: options.protector,
    repository,
  });
  const http: Omit<
    ReportIntentHttpDependencies,
    "createOwnerPrincipalId" | "ownerPrincipalId" | "readCsrf"
  > &
    Pick<ReportIntentHttpDependencies, "noticePolicy"> = {
    clock,
    commands,
    correlationId: (request) => request.headers.get("x-request-id") ?? randomUUID(),
    createIdempotency: createPostgresCreateIdempotency(options.pool, {
      clock,
      idGenerator,
      protector: options.protector,
    }),
    cookieSecure: true,
    draftCookieSecret: options.draftCookieSecret,
    noticePolicy: { locales: ["en-IN"], version: options.privacy.noticeVersion },
    rateLimiter: createPostgresRateLimiter(options.pool),
  };
  const handlers = createAuthenticatedReportIntentHandlers({
    http,
    origin: options.origin,
    sessions: createPostgresSessionRepository(options.pool),
  });
  registerReportIntentHandlers(handlers);
  (globalThis as RuntimeGlobal)[privacyKey] = options.privacy;
}

/**
 * Installs the fully composed application boundary for the current server process.
 *
 * The runtime only stores stateless ports and their durable implementations. Report drafts,
 * sessions, and idempotency records must remain in PostgreSQL; this registry is not a data store.
 * The production bootstrap should call this once before serving requests and fail deployment if it
 * cannot compose the dependencies.
 */
export function registerReportIntentHandlers(handlers: ReportIntentHttpHandlers): void {
  const target = globalThis as RuntimeGlobal;
  if (target[runtimeKey] !== undefined && target[runtimeKey] !== handlers) {
    throw new Error("REPORT_INTENT_RUNTIME_ALREADY_REGISTERED");
  }
  target[runtimeKey] = handlers;
}

export function resolveReportIntentHandlers(): ReportIntentHttpHandlers | null {
  return (globalThis as RuntimeGlobal)[runtimeKey] ?? null;
}

export const reportIntentRoutes = createReportIntentRouteAdapters(resolveReportIntentHandlers);
