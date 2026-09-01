import { deepFreeze } from "@numerology/shared";
import { parseCivilDate } from "./date";
import { canonicalHash } from "./stable-json";
import {
  ENGINE_VERSION,
  PROFILE_IDS,
  type CalculationBundle,
  type CalculationRequest,
} from "./types";
import { BundleBuilder } from "./bundle-builder";
import { normalizeNames } from "./bundle-input";
import { addLoShuFact } from "./bundle-facts";
import {
  addBalliettProfile,
  addCheiroProfile,
  addJohariProfile,
  addWesternDigitSumProfile,
  addWesternProfile,
} from "./bundle-profiles";
import { FORMULA_MANIFEST_HASH } from "./manifest";

const PROFILE_ID_SET = new Set<string>(PROFILE_IDS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertRequest(request: CalculationRequest): void {
  if (!isRecord(request)) {
    throw new RangeError("Calculation request must be an object.");
  }
  if (request.schemaVersion !== "1.0.0") {
    throw new RangeError("Calculation request schemaVersion must be 1.0.0.");
  }
  if (typeof request.civilDate !== "string" || typeof request.asOfDate !== "string") {
    throw new RangeError("Calculation request dates must be strings.");
  }
  // Date parsing and the age boundary remain delegated to the date module's canonical rules.
  const civilDate = parseCivilDate(request.civilDate);
  const asOfDate = parseCivilDate(request.asOfDate);
  if (
    civilDate.year > asOfDate.year ||
    (civilDate.year === asOfDate.year &&
      (civilDate.month > asOfDate.month ||
        (civilDate.month === asOfDate.month && civilDate.day > asOfDate.day)))
  ) {
    throw new RangeError("Civil date cannot be after the as-of date.");
  }
  let age = asOfDate.year - civilDate.year;
  if (
    asOfDate.month < civilDate.month ||
    (asOfDate.month === civilDate.month && asOfDate.day < civilDate.day)
  ) {
    age -= 1;
  }
  if (age < 18) {
    throw new RangeError("Calculation requests require an adult subject.");
  }
  if (!Array.isArray(request.names)) {
    throw new RangeError("Calculation request names must be an array.");
  }
  if (!Array.isArray(request.profiles) || request.profiles.length === 0) {
    throw new RangeError("At least one profile is required.");
  }
  const selected = new Set<string>();
  for (const profileId of request.profiles) {
    if (typeof profileId !== "string" || !PROFILE_ID_SET.has(profileId)) {
      throw new RangeError(`Unsupported profile: ${String(profileId)}.`);
    }
    if (selected.has(profileId)) {
      throw new RangeError(`Duplicate profile: ${profileId}.`);
    }
    selected.add(profileId);
  }
}

export function calculateBundle(request: CalculationRequest): CalculationBundle {
  assertRequest(request);
  const names = normalizeNames(request);
  const builder = new BundleBuilder();

  for (const profileId of request.profiles) {
    switch (profileId) {
      case "western_decoz_v1":
        addWesternProfile(builder, request, names);
        break;
      case "western_digit_sum_v1":
        addWesternDigitSumProfile(builder, request);
        break;
      case "western_balliett_1908_v1":
        addBalliettProfile(builder, request, names);
        break;
      case "cheiro_1926_v1":
        addCheiroProfile(builder, request, names);
        break;
      case "indian_johari_1990_v1":
        addJohariProfile(builder, request, names);
        break;
      case "loshu_raw_dob_v1":
        addLoShuFact(builder, profileId, request.civilDate);
        break;
      case "loshu_indian_augmented_v1":
        addLoShuFact(builder, profileId, request.civilDate);
        break;
    }
  }

  return deepFreeze({
    engineVersion: ENGINE_VERSION,
    facts: builder.facts,
    formulaManifestHash: FORMULA_MANIFEST_HASH,
    inputHash: canonicalHash(request),
    traces: builder.traces,
    warnings: builder.warnings,
  });
}

export { parseCalculationBundle, validateBundle } from "./bundle-validation";
