import type { ReportIntentHttpHandlers } from "@numerology/application";
import { createReportIntentRouteAdapters } from "./report-intent-routes";

const runtimeKey = Symbol.for("numerology.report-intent-runtime");
type RuntimeGlobal = typeof globalThis & {
  [runtimeKey]?: ReportIntentHttpHandlers;
};

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
