import { mapLetters, WESTERN_ALPHABET } from "./alphabets";
import type { BundleBuilder } from "./bundle-builder";
import { latinReadinessWarning, normalizeName, type NormalizedName } from "./identity";
import type { CalculationRequest, NameKind, ProfileId } from "./types";
import { hasAmbiguousWesternY, type WesternNameMetricResult } from "./western";

export const BIRTH_NAME_KINDS = new Set<NameKind>(["birth_full", "birth_legal", "engine_latin"]);
export const POPULAR_NAME_KINDS = new Set<NameKind>([
  "popular",
  "usual",
  "nickname",
  "professional",
  "stage",
  "current_full",
  "current_legal",
  "engine_latin",
]);

export function normalizeNames(request: CalculationRequest): readonly NormalizedName[] {
  const ids = new Set<string>();
  return Object.freeze(
    request.names.map((name) => {
      if (name === null || typeof name !== "object" || Array.isArray(name)) {
        throw new RangeError("Each name input must be an object.");
      }
      const nameInput = name as CalculationRequest["names"][number];
      if (ids.has(nameInput.id)) {
        throw new RangeError(`Duplicate name id: ${nameInput.id}.`);
      }
      ids.add(nameInput.id);
      return normalizeName(nameInput);
    }),
  );
}

export function findName(
  names: readonly NormalizedName[],
  kinds: ReadonlySet<NameKind>,
): NormalizedName | null {
  return names.find((name) => kinds.has(name.kind)) ?? null;
}

export function calculationTextForName(
  builder: BundleBuilder,
  name: NormalizedName | null,
  profileId: ProfileId,
  purpose: "birth" | "popular",
): string | null {
  if (name === null) {
    builder.addWarning({
      code: "MISSING_NAME_USE",
      message: `No ${purpose} name view was supplied; name-based metrics were not calculated.`,
      policyId: "identity.name-use-required.v1",
      profileId,
      severity: "warning",
    });
    return null;
  }

  const latinWarning = latinReadinessWarning(name, "placeholder");
  if (latinWarning !== null) {
    builder.addWarning({ ...latinWarning, profileId });
    return null;
  }

  const text = name.calculationText;
  if (text === null) {
    return null;
  }
  const unsupported = mapLetters(text, WESTERN_ALPHABET).unsupported;
  if (unsupported.length > 0) {
    builder.addWarning({
      code: "UNSUPPORTED_NAME_CHARACTER",
      inputRef: `name:${name.id}`,
      message: "Name contains unsupported Latin letters or symbols; no name number was calculated.",
      metadata: { count: unsupported.length },
      policyId: "identity.no-silent-transliteration.v1",
      profileId,
      severity: "warning",
    });
    return null;
  }
  return text;
}

export function addUnsupportedYWarnings(
  builder: BundleBuilder,
  profileId: ProfileId,
  name: NormalizedName,
): boolean {
  const missing = hasAmbiguousWesternY(name.calculationText ?? "", name.yClassifications);
  if (missing.length === 0) {
    return false;
  }
  builder.addWarning({
    code: "WESTERN_Y_CLASSIFICATION_REQUIRED",
    inputRef: `name:${name.id}`,
    message:
      "Western vowel/consonant metrics require occurrence-level Y classification and were skipped.",
    metadata: { count: missing.length },
    policyId: "identity.y-occurrence-classification.v1",
    profileId,
    severity: "warning",
  });
  return true;
}

export function addOptionalWesternNameFact(
  builder: BundleBuilder,
  profileId: ProfileId,
  metricId: "soul_urge" | "personality",
  name: NormalizedName,
  calculate: () => WesternNameMetricResult,
): WesternNameMetricResult | null {
  try {
    return calculate();
  } catch (error) {
    if (
      !(error instanceof RangeError) ||
      error.message !== "The requested name metric has no applicable letters."
    ) {
      throw error;
    }
    builder.addWarning({
      code: "NAME_METRIC_NOT_APPLICABLE",
      inputRef: `name:${name.id}`,
      message: `Western ${metricId.replace("_", " ")} has no applicable letters in this name view.`,
      metadata: { metricId },
      policyId: "western_decoz_v1.empty-name-subset.v1",
      profileId,
      severity: "info",
    });
    return null;
  }
}
