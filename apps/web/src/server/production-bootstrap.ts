import { createHash } from "node:crypto";
import { createExpireReportIntents, systemClock } from "@numerology/application";
import { createPostgresMagicLinkRepository } from "@numerology/database/magic-link-repository";
import { createPostgresMaintenanceRunner } from "@numerology/database/maintenance";
import { createDatabasePool } from "@numerology/database/pool";
import { createPostgresRateLimiter } from "@numerology/database/rate-limiter";
import { createReportIntentRepository } from "@numerology/database/report-intent-repository";
import { configureMagicLinkRuntime } from "./compose-magic-link-runtime";
import { createKmsFieldProtectorFromEnvironment } from "./kms-field-protector";
import { registerLogoutHandler, createLogoutHandler } from "./logout-runtime";
import { registerMaintenanceHandler } from "./maintenance-runtime";
import { configureReportIntentRuntime } from "./report-intent-runtime";
import { PRIVACY_NOTICE_VERSION } from "../intake/privacy-notice";

function required(environment: Record<string, string | undefined>, name: string, min = 1): string {
  const value = environment[name];
  if (!value || value.length < min) throw new Error(`RUNTIME_CONFIGURATION_MISSING_${name}`);
  return value;
}
function integer(value: string | undefined, fallback: number): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 100)
    throw new Error("RUNTIME_DATABASE_POOL_INVALID");
  return parsed;
}

/** Explicit startup: absent flag stays safely unavailable; enabled but incomplete configuration aborts startup. */
export function configureProductionRuntimes(
  environment: Record<string, string | undefined> = process.env,
): void {
  if (environment.CUSTOMER_RUNTIME_ENABLED !== "true") return;
  const origin = required(environment, "APP_ORIGIN");
  const databaseUrl = required(environment, "DATABASE_URL");
  if (environment.PRIVACY_REVIEWED !== "true") throw new Error("RUNTIME_PRIVACY_NOTICE_MISMATCH");
  const privacy = {
    controllerName: required(environment, "PRIVACY_CONTROLLER_NAME"),
    contactEmail: required(environment, "PRIVACY_CONTACT_EMAIL"),
    noticeVersion: required(environment, "PRIVACY_NOTICE_VERSION"),
    reviewed: true as const,
  };
  if (privacy.noticeVersion !== PRIVACY_NOTICE_VERSION)
    throw new Error("RUNTIME_PRIVACY_NOTICE_MISMATCH");
  const pool = createDatabasePool({
    connectionString: databaseUrl,
    max: integer(environment.DATABASE_POOL_MAX, 5),
  });
  const protector = createKmsFieldProtectorFromEnvironment(environment);
  configureReportIntentRuntime({
    pool,
    protector,
    origin,
    draftCookieSecret: required(environment, "DRAFT_COOKIE_SECRET", 32),
    privacy,
  });
  const limiter = createPostgresRateLimiter(pool);
  const edgeHeader = required(environment, "TRUSTED_CLIENT_IP_HEADER").toLowerCase();
  configureMagicLinkRuntime({
    pool,
    protector,
    origin,
    fromEmail: required(environment, "AUTH_FROM_EMAIL"),
    requestBudget: {
      async consume(request) {
        const identity = request.headers.get(edgeHeader);
        if (!identity || identity.length > 256) return false;
        const key = createHash("sha256").update(`magic-ip:${identity}`).digest("hex");
        return (await limiter.consume(key, 10, 60_000)).allowed;
      },
    },
  });
  registerLogoutHandler(createLogoutHandler({ pool, origin }));
  const expiry = createExpireReportIntents({
    clock: systemClock,
    protector,
    repository: createReportIntentRepository(pool),
  });
  const magic = createPostgresMagicLinkRepository(pool);
  registerMaintenanceHandler({
    secret: required(environment, "MAINTENANCE_BEARER_SECRET", 32),
    runner: createPostgresMaintenanceRunner(pool, {
      expireReportIntents: async (limit) => (await expiry.execute({ limit })).expiredCount,
      purgeMagicLinks: (now, limit) => magic.purgeExpired(now, limit),
    }),
  });
}
