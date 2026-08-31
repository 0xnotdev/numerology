import {
  type CalculatedFact,
  type CalculationBundle,
  canonicalHash,
  type ProfileId,
  stableStringify,
  validateBundle,
} from "@numerology/engine";
import { type CompiledDoctrineRelease, indexRuleIds, validateCompiledDoctrine } from "./compiler";
import { evaluateConditions } from "./conditions";
import type {
  DoctrineContradiction,
  DoctrineLocale,
  DoctrineRule,
  SourceReference,
} from "./schemas";

const HARD_BLOCKED_SAFETY_TAGS = new Set([
  "coercion",
  "delusion_reinforcement",
  "eligibility",
  "employment",
  "finance",
  "gambling",
  "legal",
  "medical",
  "physical_safety",
  "pregnancy",
  "self_harm_crisis",
]);

const UNSAFE_CLAIM_PATTERNS = Object.freeze([
  /\b(?:death|die|disease|diagnos(?:e|is)|treatment|fertility|pregnan(?:cy|t)|suicide)\b/iu,
  /\b(?:invest(?:ing|ment)?|credit|gambl(?:e|ing)|lottery|legal outcome)\b/iu,
  /\b(?:guaranteed|destined|cannot fail|will cure|curse removal|must leave)\b/iu,
]);

export type DoctrineExclusionCode =
  | "BLOCKED_ACTION"
  | "BLOCKED_SOURCE"
  | "BLOCKED_STATUS"
  | "DEPRECATED_STATUS"
  | "EXCLUDED_BY_RULE"
  | "EXPERIMENTAL_NOT_PROMOTED"
  | "LOW_CONFIDENCE_NOT_PROMOTED"
  | "MISSING_LOCALE"
  | "UNSAFE_RULE";

export interface DoctrineExclusion {
  readonly code: DoctrineExclusionCode;
  readonly excludedByRuleId?: string;
  readonly factId: string;
  readonly ruleId: string;
}

export interface ResolvedDoctrineRule {
  readonly actionKeys: readonly string[];
  readonly claims: readonly string[];
  readonly confidence: DoctrineRule["confidence"];
  readonly factId: string;
  readonly metricId: string;
  readonly profileId: ProfileId;
  readonly ruleId: string;
  readonly ruleVersion: string;
  readonly sourceRefs: readonly SourceReference[];
  readonly themes: readonly string[];
  readonly valence: DoctrineRule["valence"];
}

export interface DoctrineResolution {
  readonly boundaryWarnings: readonly DoctrineContradiction[];
  readonly calculationBundleHash: string;
  readonly doctrineHash: string;
  readonly excluded: readonly DoctrineExclusion[];
  readonly locale: DoctrineLocale;
  readonly matches: readonly ResolvedDoctrineRule[];
  readonly resolutionHash: string;
}

export interface DoctrineResolveOptions {
  readonly locale: DoctrineLocale;
}

export class DoctrineRegistryError extends RangeError {
  constructor(code: string, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "DoctrineRegistryError";
  }
}

interface Candidate {
  readonly fact: CalculatedFact;
  readonly rule: DoctrineRule;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return value;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

const CONFIDENCE_RANK: Readonly<Record<DoctrineRule["confidence"], number>> = Object.freeze({
  high: 0,
  medium: 1,
  low: 2,
});

function compareCandidates(left: Candidate, right: Candidate): number {
  return (
    CONFIDENCE_RANK[left.rule.confidence] - CONFIDENCE_RANK[right.rule.confidence] ||
    compareText(left.rule.ruleId, right.rule.ruleId) ||
    compareText(left.fact.factId, right.fact.factId)
  );
}

function hasUnsafeTag(tags: readonly string[]): boolean {
  return tags.some((tag) => HARD_BLOCKED_SAFETY_TAGS.has(tag));
}

function hasUnsafeLanguage(atoms: readonly string[]): boolean {
  return atoms.some((atom) => UNSAFE_CLAIM_PATTERNS.some((pattern) => pattern.test(atom)));
}

function exclusion(
  candidate: Candidate,
  code: DoctrineExclusionCode,
  excludedByRuleId?: string,
): DoctrineExclusion {
  return {
    code,
    ...(excludedByRuleId === undefined ? {} : { excludedByRuleId }),
    factId: candidate.fact.factId,
    ruleId: candidate.rule.ruleId,
  };
}

export class DoctrineRegistry {
  readonly #release: CompiledDoctrineRelease;
  readonly #rules: ReadonlyMap<string, DoctrineRule>;

  constructor(release: CompiledDoctrineRelease) {
    const validation = validateCompiledDoctrine(release);
    if (!validation.valid) {
      throw new DoctrineRegistryError(
        "INVALID_COMPILED_DOCTRINE",
        validation.diagnostics.map((item) => item.code).join(","),
      );
    }
    this.#release = release;
    this.#rules = new Map(release.rules.map((rule) => [rule.ruleId, rule]));
  }

  resolve(bundleInput: unknown, options: DoctrineResolveOptions): DoctrineResolution {
    const bundleValidation = validateBundle(bundleInput);
    if (!bundleValidation.valid) {
      throw new DoctrineRegistryError(
        "INVALID_CALCULATION_BUNDLE",
        bundleValidation.diagnostics.join(","),
      );
    }
    if (!this.#release.locales.includes(options.locale)) {
      throw new DoctrineRegistryError("UNSUPPORTED_DOCTRINE_LOCALE", options.locale);
    }
    const bundle = bundleInput as CalculationBundle;
    const candidates: Candidate[] = [];
    for (const fact of [...bundle.facts].sort((left, right) =>
      compareText(left.factId, right.factId),
    )) {
      const ruleIds = indexRuleIds(this.#release.index, fact.profileId, fact.metricId, fact.root);
      for (const ruleId of ruleIds) {
        const rule = this.#rules.get(ruleId);
        if (rule !== undefined && evaluateConditions(rule.conditions, fact)) {
          candidates.push({ fact, rule });
        }
      }
    }
    candidates.sort(compareCandidates);

    const promotions = new Set(this.#release.promotions);
    const sources = new Map(this.#release.sources.map((source) => [source.sourceId, source]));
    const actions = new Map(this.#release.actions.map((action) => [action.actionKey, action]));
    const eligible: Candidate[] = [];
    const excluded: DoctrineExclusion[] = [];

    for (const candidate of candidates) {
      const { rule } = candidate;
      if (rule.status === "blocked") {
        excluded.push(exclusion(candidate, "BLOCKED_STATUS"));
        continue;
      }
      if (rule.status === "deprecated") {
        excluded.push(exclusion(candidate, "DEPRECATED_STATUS"));
        continue;
      }
      if (rule.status === "experimental" && !promotions.has(rule.ruleId)) {
        excluded.push(exclusion(candidate, "EXPERIMENTAL_NOT_PROMOTED"));
        continue;
      }
      if (rule.confidence === "low" && !promotions.has(rule.ruleId)) {
        excluded.push(exclusion(candidate, "LOW_CONFIDENCE_NOT_PROMOTED"));
        continue;
      }
      if (rule.claims[options.locale].length === 0) {
        excluded.push(exclusion(candidate, "MISSING_LOCALE"));
        continue;
      }
      if (hasUnsafeTag(rule.safetyTags) || hasUnsafeLanguage(Object.values(rule.claims).flat())) {
        excluded.push(exclusion(candidate, "UNSAFE_RULE"));
        continue;
      }
      if (
        rule.sourceRefs.some((reference) => sources.get(reference.sourceId)?.status !== "active")
      ) {
        excluded.push(exclusion(candidate, "BLOCKED_SOURCE"));
        continue;
      }
      const referencedActions = rule.actionKeys.map((actionKey) => actions.get(actionKey));
      if (
        referencedActions.some(
          (action) =>
            action === undefined ||
            action.status !== "active" ||
            (action.instructions[options.locale] ?? []).length === 0,
        )
      ) {
        excluded.push(exclusion(candidate, "BLOCKED_ACTION"));
        continue;
      }
      if (
        referencedActions.some(
          (action) =>
            action !== undefined &&
            (hasUnsafeTag(action.safetyTags) ||
              hasUnsafeLanguage(
                Object.values(action.instructions).flatMap((atoms) => atoms ?? []),
              )),
        )
      ) {
        excluded.push(exclusion(candidate, "UNSAFE_RULE"));
        continue;
      }
      eligible.push(candidate);
    }

    const suppressed = new Map<string, string>();
    for (const candidate of eligible) {
      for (const target of candidate.rule.exclusions) {
        const prior = suppressed.get(target);
        if (prior === undefined || compareText(candidate.rule.ruleId, prior) < 0) {
          suppressed.set(target, candidate.rule.ruleId);
        }
      }
    }

    const selected = eligible.filter((candidate) => {
      const excludedBy = suppressed.get(candidate.rule.ruleId);
      if (excludedBy === undefined) {
        return true;
      }
      excluded.push(exclusion(candidate, "EXCLUDED_BY_RULE", excludedBy));
      return false;
    });

    const matches: ResolvedDoctrineRule[] = selected
      .sort(compareCandidates)
      .map(({ fact, rule }) => ({
        actionKeys: [...rule.actionKeys],
        claims: [...rule.claims[options.locale]],
        confidence: rule.confidence,
        factId: fact.factId,
        metricId: rule.metricId,
        profileId: rule.profileId,
        ruleId: rule.ruleId,
        ruleVersion: rule.version,
        sourceRefs: rule.sourceRefs.map((reference) => ({ ...reference })),
        themes: [...rule.themes],
        valence: rule.valence,
      }));

    excluded.sort(
      (left, right) =>
        compareText(left.ruleId, right.ruleId) ||
        compareText(left.factId, right.factId) ||
        compareText(left.code, right.code),
    );

    const profileIds = new Set(bundle.facts.map((fact) => fact.profileId));
    const boundaryWarnings = this.#release.contradictions
      .filter(
        (item) =>
          profileIds.has(item.profileA as ProfileId) && profileIds.has(item.profileB as ProfileId),
      )
      .map((item) => ({ ...item }))
      .sort((left, right) => compareText(left.contradictionId, right.contradictionId));

    const calculationBundleHash = canonicalHash({
      engineVersion: bundle.engineVersion,
      formulaManifestHash: bundle.formulaManifestHash,
      inputHash: bundle.inputHash,
    });
    const content = {
      boundaryWarnings,
      calculationBundleHash,
      doctrineHash: this.#release.releaseHash,
      excluded,
      locale: options.locale,
      matches,
    };
    return deepFreeze({ ...content, resolutionHash: canonicalHash(content) });
  }
}

export function createDoctrineRegistry(release: CompiledDoctrineRelease): DoctrineRegistry {
  return new DoctrineRegistry(release);
}

export function stableDoctrineResolution(resolution: DoctrineResolution): string {
  return stableStringify(resolution);
}
