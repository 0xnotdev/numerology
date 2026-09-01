import { deepFreeze } from "@numerology/shared";
import { isFactId } from "./ids";
import { FORMULA_MANIFEST_HASH } from "./manifest";
import type {
  BundleValidationResult,
  CalculationBundle,
  EngineWarning,
  NumericTrace,
} from "./types";
import { ENGINE_VERSION, PROFILE_IDS } from "./types";

const PROFILE_ID_SET = new Set<string>(PROFILE_IDS);
const TRACE_OPERATIONS = new Set<NumericTrace["operation"]>([
  "count_digits",
  "difference",
  "map_letters",
  "reduce",
  "sum",
]);
const WARNING_CODES = new Set<EngineWarning["code"]>([
  "ENGINE_LATIN_NAME_REQUIRED",
  "ENGINE_TRANSLITERATION_CONFIRMATION_REQUIRED",
  "JOHARI_PREDAWN_BOUNDARY_EXCLUDED",
  "MISSING_NAME_USE",
  "NAME_METRIC_NOT_APPLICABLE",
  "UNSUPPORTED_NAME_CHARACTER",
  "WESTERN_Y_CLASSIFICATION_REQUIRED",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isSha256Hash(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/u.test(value);
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isTraceInput(value: unknown): value is number | string {
  return typeof value === "string" || isNonNegativeSafeInteger(value);
}

export function validateBundle(bundle: unknown): BundleValidationResult {
  const diagnostics: string[] = [];
  if (!isRecord(bundle)) {
    return { diagnostics: Object.freeze(["bundle must be an object"]), valid: false };
  }

  if (bundle.engineVersion !== ENGINE_VERSION) {
    diagnostics.push("engineVersion mismatch");
  }
  if (!isSha256Hash(bundle.formulaManifestHash)) {
    diagnostics.push("formulaManifestHash must be a sha256 hash");
  } else if (bundle.formulaManifestHash !== FORMULA_MANIFEST_HASH) {
    diagnostics.push("formulaManifestHash mismatch");
  }
  if (!isSha256Hash(bundle.inputHash)) {
    diagnostics.push("inputHash must be a sha256 hash");
  }
  if (!Array.isArray(bundle.traces)) {
    diagnostics.push("traces must be an array");
  }
  if (!Array.isArray(bundle.facts)) {
    diagnostics.push("facts must be an array");
  }
  if (!Array.isArray(bundle.warnings)) {
    diagnostics.push("warnings must be an array");
  }
  if (
    diagnostics.length > 0 &&
    (!Array.isArray(bundle.traces) ||
      !Array.isArray(bundle.facts) ||
      !Array.isArray(bundle.warnings))
  ) {
    return { diagnostics: Object.freeze(diagnostics), valid: false };
  }

  const traceIds = new Set<string>();
  for (const [index, rawTrace] of (bundle.traces as readonly unknown[]).entries()) {
    if (!isRecord(rawTrace)) {
      diagnostics.push(`trace[${index}] must be an object`);
      continue;
    }
    if (typeof rawTrace.traceId !== "string" || rawTrace.traceId.length === 0) {
      diagnostics.push(`trace[${index}] has an invalid traceId`);
      continue;
    }
    if (traceIds.has(rawTrace.traceId)) {
      diagnostics.push(`duplicate trace: ${rawTrace.traceId}`);
    }
    traceIds.add(rawTrace.traceId);
    if (!TRACE_OPERATIONS.has(rawTrace.operation as NumericTrace["operation"])) {
      diagnostics.push(`trace[${index}] has an invalid operation`);
    }
    if (!Array.isArray(rawTrace.inputs) || !Array.isArray(rawTrace.intermediates)) {
      diagnostics.push(`trace[${index}] inputs/intermediates must be arrays`);
    } else {
      if (!rawTrace.inputs.every(isTraceInput)) {
        diagnostics.push(`trace[${index}] inputs must be numbers or strings`);
      }
      if (!rawTrace.intermediates.every(isNonNegativeSafeInteger)) {
        diagnostics.push(`trace[${index}] intermediates must be non-negative integers`);
      }
    }
    if (typeof rawTrace.policyId !== "string" || rawTrace.policyId.length === 0) {
      diagnostics.push(`trace[${index}] has an invalid policyId`);
    }
    if (!isNonNegativeSafeInteger(rawTrace.output)) {
      diagnostics.push(`trace[${index}] has an invalid output`);
    }
  }

  const factIds = new Set<string>();
  for (const [index, rawFact] of (bundle.facts as readonly unknown[]).entries()) {
    if (!isRecord(rawFact)) {
      diagnostics.push(`fact[${index}] must be an object`);
      continue;
    }
    if (!isFactId(rawFact.factId)) {
      diagnostics.push(`fact[${index}] has an invalid factId`);
    } else {
      if (factIds.has(rawFact.factId)) {
        diagnostics.push(`duplicate fact: ${rawFact.factId}`);
      }
      factIds.add(rawFact.factId);
    }
    if (typeof rawFact.metricId !== "string" || rawFact.metricId.length === 0) {
      diagnostics.push(`fact[${index}] has an invalid metricId`);
    }
    if (typeof rawFact.profileId !== "string" || !PROFILE_ID_SET.has(rawFact.profileId)) {
      diagnostics.push(`unsupported profile: ${String(rawFact.profileId)}`);
    }
    if (!isNonNegativeSafeInteger(rawFact.root)) {
      diagnostics.push(`fact[${index}] has an invalid root`);
    }
    if (!Array.isArray(rawFact.displayTokens)) {
      diagnostics.push(`fact[${index}] displayTokens must be an array`);
    } else if (!rawFact.displayTokens.every((token) => typeof token === "string")) {
      diagnostics.push(`fact[${index}] displayTokens must contain strings`);
    }
    if (rawFact.compound !== undefined && !isNonNegativeSafeInteger(rawFact.compound)) {
      diagnostics.push(`fact[${index}] has an invalid compound`);
    }
    if (
      rawFact.master !== undefined &&
      rawFact.master !== 11 &&
      rawFact.master !== 22 &&
      rawFact.master !== 33
    ) {
      diagnostics.push(`fact[${index}] has an invalid master`);
    }
    if (!Array.isArray(rawFact.traceIds)) {
      diagnostics.push(`fact[${index}] traceIds must be an array`);
      continue;
    }
    for (const traceId of rawFact.traceIds) {
      if (typeof traceId !== "string" || !traceIds.has(traceId)) {
        diagnostics.push(`missing trace: ${String(traceId)}`);
      }
    }
  }

  const warningIds = new Set<string>();
  for (const [index, rawWarning] of (bundle.warnings as readonly unknown[]).entries()) {
    if (!isRecord(rawWarning)) {
      diagnostics.push(`warning[${index}] must be an object`);
      continue;
    }
    if (typeof rawWarning.warningId !== "string" || rawWarning.warningId.length === 0) {
      diagnostics.push(`warning[${index}] has an invalid warningId`);
    } else if (warningIds.has(rawWarning.warningId)) {
      diagnostics.push(`duplicate warning: ${rawWarning.warningId}`);
    } else {
      warningIds.add(rawWarning.warningId);
    }
    if (
      typeof rawWarning.code !== "string" ||
      !WARNING_CODES.has(rawWarning.code as EngineWarning["code"])
    ) {
      diagnostics.push(`warning[${index}] has an invalid code`);
    }
    if (typeof rawWarning.message !== "string" || rawWarning.message.length === 0) {
      diagnostics.push(`warning[${index}] has an invalid message`);
    }
    if (typeof rawWarning.policyId !== "string" || rawWarning.policyId.length === 0) {
      diagnostics.push(`warning[${index}] has an invalid policyId`);
    }
    if (rawWarning.severity !== "info" && rawWarning.severity !== "warning") {
      diagnostics.push(`warning[${index}] has an invalid severity`);
    }
    if (
      rawWarning.profileId !== undefined &&
      (typeof rawWarning.profileId !== "string" || !PROFILE_ID_SET.has(rawWarning.profileId))
    ) {
      diagnostics.push(`warning[${index}] has an unsupported profile`);
    }
  }

  return { diagnostics: Object.freeze(diagnostics), valid: diagnostics.length === 0 };
}

/** Validates, clones, brands, and freezes an untrusted calculation bundle. */
export function parseCalculationBundle(input: unknown): CalculationBundle {
  const validation = validateBundle(input);
  if (!validation.valid) {
    throw new RangeError(`INVALID_CALCULATION_BUNDLE: ${validation.diagnostics.join(", ")}`);
  }
  // This is the sole untrusted-wire to branded CalculationBundle boundary.
  return deepFreeze(structuredClone(input) as CalculationBundle);
}
