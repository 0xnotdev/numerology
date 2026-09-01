import {
  type CalculatedFact,
  type CalculationBundle,
  type FactId,
  type ProfileId,
  canonicalHash,
  parseCalculationBundle,
  stableStringify,
} from "@numerology/engine";
import { deepFreeze } from "@numerology/shared";
import {
  CANONICAL_RULE_SCHEMA_HASH,
  type CanonicalDoctrineRule,
  type ClaimClass,
  type ReviewState,
  type RuleConfidence,
  type RuleStatus,
  type RuleType,
} from "./canonical-rule";
import { parseCompiledDoctrine } from "./compiler";
import { evaluateTrigger } from "./conditions";
import { compareText } from "./diagnostics";
import type { ReportSectionKey } from "./editorial";
import type { ActionId, RuleId, SourceId } from "./ids";
import { indexRuleIds } from "./indexer";
import type {
  CompiledDoctrineRelease,
  DoctrineAction,
  DoctrineContradiction,
  DoctrineRuleBinding,
  DoctrineSource,
} from "./release-model";

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

export type DoctrineOmissionCode =
  | "BLOCKED_ACTION"
  | "BLOCKED_SOURCE"
  | "INVALID_STATUS"
  | "OUTSIDE_VALIDITY"
  | "UNRESOLVED_CONFIDENCE"
  | "UNSAFE_RULE";

export interface DoctrineOmission {
  readonly code: DoctrineOmissionCode;
  readonly factId: FactId;
  readonly ruleId: RuleId;
}

/** A target rule was removed because another matching rule explicitly suppresses its ID. */
export interface DoctrineSuppression {
  readonly suppressedFactId: FactId;
  readonly suppressedRuleId: RuleId;
  readonly suppressingFactId: FactId;
  readonly suppressingRuleId: RuleId;
}

export interface ResolvedSourceReference {
  readonly creator: string;
  readonly extractionNote: string | null;
  readonly locale: string;
  readonly locator: string;
  readonly sourceId: SourceId;
  readonly sourceType: DoctrineSource["source_type"];
  readonly title: string;
}

export interface ResolvedAction {
  readonly actionId: ActionId;
  readonly instructions: readonly string[];
  readonly safetyTags: readonly string[];
  readonly version: string;
}

export interface ResolvedEvidence {
  readonly actionIds: readonly ActionId[];
  readonly actions: readonly ResolvedAction[];
  readonly calculationTraceIds: readonly string[];
  readonly claimClass: ClaimClass;
  readonly claims: readonly string[];
  readonly confidence: RuleConfidence;
  readonly contentHash: string;
  readonly factId: FactId;
  readonly metricId: string;
  readonly positionSemantics: string | null;
  readonly prohibitedPhrases: readonly string[];
  readonly profileId: ProfileId;
  readonly reviewState: ReviewState;
  readonly reviewers: readonly string[];
  readonly ruleId: RuleId;
  readonly ruleType: RuleType;
  readonly ruleVersion: string;
  readonly safetyTags: readonly string[];
  readonly sectionKey: ReportSectionKey;
  readonly sourceIds: readonly SourceId[];
  readonly sourceReferences: readonly ResolvedSourceReference[];
  readonly status: RuleStatus;
  /** IDs this matching rule suppresses; this never means this evidence discards itself. */
  readonly suppressesRuleIds: readonly RuleId[];
  readonly themes: {
    readonly constructive: readonly string[];
    readonly tensions: readonly string[];
  };
  readonly validity: { readonly from: string | null; readonly to: string | null };
}

export interface EvidenceResolutionTrace {
  readonly actionIds: readonly ActionId[];
  readonly factId: FactId;
  readonly outcome: "omitted" | "selected" | "suppressed";
  readonly reason: DoctrineOmissionCode | RuleId | null;
  readonly ruleId: RuleId;
  readonly sourceIds: readonly SourceId[];
}

export interface EvidenceReproducibility {
  readonly asOfDate: string;
  readonly calculationBundleHash: string;
  readonly canonicalRuleSchemaHash: string;
  readonly doctrineReleaseHash: string;
  readonly doctrineReleaseId: string;
  readonly doctrineSchemaVersion: "1.0.0";
  readonly engineVersion: string;
  readonly formulaManifestHash: string;
  readonly inputHash: string;
  readonly locale: string;
  readonly releasedOn: string;
}

/** The sole immutable doctrine-to-report boundary. No report-side reshaping is required. */
export interface ResolvedEvidenceBundle {
  readonly boundaryWarnings: readonly DoctrineContradiction[];
  readonly evidence: readonly ResolvedEvidence[];
  readonly omissions: readonly DoctrineOmission[];
  readonly reproducibility: EvidenceReproducibility;
  readonly resolutionHash: string;
  readonly schemaVersion: "1.0.0";
  readonly suppressions: readonly DoctrineSuppression[];
  readonly traces: readonly EvidenceResolutionTrace[];
}

export interface DoctrineResolveOptions {
  readonly asOfDate: string;
  readonly locale: string;
}

export class DoctrineRegistryError extends RangeError {
  constructor(code: string, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "DoctrineRegistryError";
  }
}

interface Candidate {
  readonly binding: DoctrineRuleBinding;
  readonly fact: CalculatedFact;
  readonly rule: CanonicalDoctrineRule;
}

const CONFIDENCE_RANK: Readonly<Record<RuleConfidence, number>> = Object.freeze({
  high: 0,
  low: 2,
  medium: 1,
  unresolved: 3,
});

function compareCandidates(left: Candidate, right: Candidate): number {
  return (
    CONFIDENCE_RANK[left.rule.confidence] - CONFIDENCE_RANK[right.rule.confidence] ||
    compareText(left.rule.rule_id, right.rule.rule_id) ||
    compareText(left.fact.factId, right.fact.factId)
  );
}

function hasUnsafeTag(tags: readonly string[]): boolean {
  return tags.some((tag) => HARD_BLOCKED_SAFETY_TAGS.has(tag));
}

function hasUnsafeLanguage(atoms: readonly string[]): boolean {
  return atoms.some((atom) => UNSAFE_CLAIM_PATTERNS.some((pattern) => pattern.test(atom)));
}

function isIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (match === null) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return (
    month >= 1 && month <= 12 && day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate()
  );
}

function candidateKey(candidate: Candidate): string {
  return `${candidate.fact.factId}\u0000${candidate.rule.rule_id}`;
}

function omission(candidate: Candidate, code: DoctrineOmissionCode): DoctrineOmission {
  return { code, factId: candidate.fact.factId, ruleId: candidate.rule.rule_id };
}

function omissionCode(
  candidate: Candidate,
  options: DoctrineResolveOptions,
  sources: ReadonlyMap<SourceId, DoctrineSource>,
  actions: ReadonlyMap<ActionId, DoctrineAction>,
): DoctrineOmissionCode | null {
  const { binding, rule } = candidate;
  if (rule.status !== "active") {
    return "INVALID_STATUS";
  }
  if (
    (rule.valid_from !== null && options.asOfDate < rule.valid_from) ||
    (rule.valid_to !== null && options.asOfDate > rule.valid_to)
  ) {
    return "OUTSIDE_VALIDITY";
  }
  if (rule.confidence === "unresolved") {
    return "UNRESOLVED_CONFIDENCE";
  }
  if (hasUnsafeTag(binding.safety_tags) || hasUnsafeLanguage(rule.safe_paraphrases)) {
    return "UNSAFE_RULE";
  }
  if (
    rule.source_links.some((reference) => sources.get(reference.source_id)?.status !== "active")
  ) {
    return "BLOCKED_SOURCE";
  }
  const referencedActions = binding.action_ids.map((actionId) => actions.get(actionId));
  if (referencedActions.some((action) => action?.status !== "active")) {
    return "BLOCKED_ACTION";
  }
  if (
    referencedActions.some(
      (action) =>
        action !== undefined &&
        (hasUnsafeTag(action.safety_tags) ||
          hasUnsafeLanguage(Object.values(action.instructions).flat())),
    )
  ) {
    return "UNSAFE_RULE";
  }
  return null;
}

function toEvidence(
  candidate: Candidate,
  locale: string,
  actions: ReadonlyMap<ActionId, DoctrineAction>,
  sources: ReadonlyMap<SourceId, DoctrineSource>,
): ResolvedEvidence {
  const { binding, fact, rule } = candidate;
  /* c8 ignore next 3 -- compiled active rules require a content hash. */
  if (rule.content_hash === null) {
    throw new DoctrineRegistryError("INVARIANT_CONTENT_HASH", rule.rule_id);
  }
  const resolvedActions = binding.action_ids.map((actionId) => {
    const action = actions.get(actionId);
    /* c8 ignore next 3 -- compiled bindings reject missing actions. */
    if (action === undefined) {
      throw new DoctrineRegistryError("INVARIANT_ACTION", actionId);
    }
    return {
      actionId,
      instructions: [...(action.instructions[locale] ?? [])],
      safetyTags: [...action.safety_tags],
      version: action.version,
    };
  });
  const sourceReferences = rule.source_links.map((reference) => {
    const source = sources.get(reference.source_id);
    /* c8 ignore next 3 -- compiled source references reject missing sources. */
    if (source === undefined) {
      throw new DoctrineRegistryError("INVARIANT_SOURCE", reference.source_id);
    }
    return {
      creator: source.creator,
      extractionNote: reference.extraction_note,
      locale: source.locale,
      locator: reference.locator,
      sourceId: reference.source_id,
      sourceType: source.source_type,
      title: source.title,
    };
  });
  return {
    actionIds: [...binding.action_ids],
    actions: resolvedActions,
    calculationTraceIds: [...fact.traceIds],
    claimClass: rule.claim_class,
    claims: [...rule.safe_paraphrases],
    confidence: rule.confidence,
    contentHash: rule.content_hash,
    factId: fact.factId,
    metricId: fact.metricId,
    positionSemantics: rule.position_semantics,
    prohibitedPhrases: [...rule.prohibited_phrases],
    profileId: fact.profileId,
    reviewState: rule.review_state,
    reviewers: [...rule.reviewers],
    ruleId: rule.rule_id,
    ruleType: rule.rule_type,
    ruleVersion: rule.rule_version,
    safetyTags: [...binding.safety_tags],
    sectionKey: binding.section_key,
    sourceIds: rule.source_links.map((reference) => reference.source_id),
    sourceReferences,
    status: rule.status,
    suppressesRuleIds: [...binding.suppresses_rule_ids],
    themes: {
      constructive: [...rule.themes.constructive],
      tensions: [...rule.themes.tensions],
    },
    validity: { from: rule.valid_from, to: rule.valid_to },
  };
}

export class DoctrineRegistry {
  readonly #release: CompiledDoctrineRelease;
  readonly #rules: ReadonlyMap<RuleId, CanonicalDoctrineRule>;
  readonly #bindings: ReadonlyMap<RuleId, DoctrineRuleBinding>;

  constructor(releaseInput: unknown) {
    this.#release = parseCompiledDoctrine(releaseInput);
    this.#rules = new Map(this.#release.rules.map((rule) => [rule.rule_id, rule]));
    this.#bindings = new Map(this.#release.bindings.map((binding) => [binding.rule_id, binding]));
  }

  resolve(bundleInput: unknown, options: DoctrineResolveOptions): ResolvedEvidenceBundle {
    let bundle: CalculationBundle;
    try {
      bundle = parseCalculationBundle(bundleInput);
    } catch (error) {
      throw new DoctrineRegistryError("INVALID_CALCULATION_BUNDLE", String(error));
    }
    if (!this.#release.locales.includes(options.locale)) {
      throw new DoctrineRegistryError("UNSUPPORTED_DOCTRINE_LOCALE", options.locale);
    }
    if (!isIsoDate(options.asOfDate)) {
      throw new DoctrineRegistryError("INVALID_AS_OF_DATE", options.asOfDate);
    }

    const candidates: Candidate[] = [];
    for (const fact of [...bundle.facts].sort((left, right) =>
      compareText(left.factId, right.factId),
    )) {
      const ruleIds = indexRuleIds(this.#release.index, fact.profileId, fact.metricId, fact.root);
      for (const ruleId of ruleIds) {
        const rule = this.#rules.get(ruleId);
        const binding = this.#bindings.get(ruleId);
        if (
          rule !== undefined &&
          binding !== undefined &&
          rule.locale === options.locale &&
          evaluateTrigger(rule.trigger, fact)
        ) {
          candidates.push({ binding, fact, rule });
        }
      }
    }
    candidates.sort(compareCandidates);

    const sources = new Map(this.#release.sources.map((source) => [source.source_id, source]));
    const actions = new Map(this.#release.actions.map((action) => [action.action_id, action]));
    const eligible: Candidate[] = [];
    const omissions: DoctrineOmission[] = [];
    const omissionReasons = new Map<string, DoctrineOmissionCode>();
    for (const candidate of candidates) {
      const code = omissionCode(candidate, options, sources, actions);
      if (code === null) {
        eligible.push(candidate);
      } else {
        omissions.push(omission(candidate, code));
        omissionReasons.set(candidateKey(candidate), code);
      }
    }

    const suppressorCandidates = new Map<RuleId, Candidate[]>();
    for (const candidate of eligible) {
      for (const target of candidate.binding.suppresses_rule_ids) {
        const group = suppressorCandidates.get(target) ?? [];
        group.push(candidate);
        suppressorCandidates.set(target, group);
      }
    }
    for (const group of suppressorCandidates.values()) {
      group.sort(compareCandidates);
    }

    const resolvedSuppressors = new Map<string, Candidate | null>();
    function selectedSuppressor(candidate: Candidate): Candidate | null {
      const key = candidateKey(candidate);
      const cached = resolvedSuppressors.get(key);
      if (cached !== undefined) {
        return cached;
      }
      // Semantic compilation rejects cycles, so recursion always reaches an unsuppressed rule.
      for (const suppressor of suppressorCandidates.get(candidate.rule.rule_id) ?? []) {
        if (selectedSuppressor(suppressor) === null) {
          resolvedSuppressors.set(key, suppressor);
          return suppressor;
        }
      }
      resolvedSuppressors.set(key, null);
      return null;
    }

    const selected: Candidate[] = [];
    const suppressions: DoctrineSuppression[] = [];
    for (const candidate of eligible) {
      const suppressor = selectedSuppressor(candidate);
      if (suppressor === null) {
        selected.push(candidate);
      } else {
        suppressions.push({
          suppressedFactId: candidate.fact.factId,
          suppressedRuleId: candidate.rule.rule_id,
          suppressingFactId: suppressor.fact.factId,
          suppressingRuleId: suppressor.rule.rule_id,
        });
      }
    }

    const evidence = selected
      .sort(compareCandidates)
      .map((candidate) => toEvidence(candidate, options.locale, actions, sources));
    omissions.sort(
      (left, right) =>
        compareText(left.ruleId, right.ruleId) || compareText(left.factId, right.factId),
    );
    suppressions.sort(
      (left, right) =>
        compareText(left.suppressedRuleId, right.suppressedRuleId) ||
        compareText(left.suppressedFactId, right.suppressedFactId) ||
        compareText(left.suppressingRuleId, right.suppressingRuleId) ||
        compareText(left.suppressingFactId, right.suppressingFactId),
    );

    const suppressedKeys = new Map(
      suppressions.map((item) => [
        `${item.suppressedFactId}\u0000${item.suppressedRuleId}`,
        item.suppressingRuleId,
      ]),
    );
    const traces = candidates.map((candidate): EvidenceResolutionTrace => {
      const key = candidateKey(candidate);
      const omitted = omissionReasons.get(key);
      const suppressor = suppressedKeys.get(key);
      return {
        actionIds: [...candidate.binding.action_ids],
        factId: candidate.fact.factId,
        outcome:
          omitted !== undefined ? "omitted" : suppressor !== undefined ? "suppressed" : "selected",
        reason: omitted ?? suppressor ?? null,
        ruleId: candidate.rule.rule_id,
        sourceIds: candidate.rule.source_links.map((link) => link.source_id),
      };
    });

    const profileIds = new Set<string>(bundle.facts.map((fact) => fact.profileId));
    const boundaryWarnings = this.#release.contradictions
      .filter((item) => profileIds.has(item.profile_a) && profileIds.has(item.profile_b))
      .map((item) => ({ ...item }))
      .sort((left, right) => compareText(left.contradiction_id, right.contradiction_id));
    const reproducibility: EvidenceReproducibility = {
      asOfDate: options.asOfDate,
      calculationBundleHash: canonicalHash(bundle),
      canonicalRuleSchemaHash: CANONICAL_RULE_SCHEMA_HASH,
      doctrineReleaseHash: this.#release.release_hash,
      doctrineReleaseId: this.#release.release_id,
      doctrineSchemaVersion: this.#release.schema_version,
      engineVersion: bundle.engineVersion,
      formulaManifestHash: bundle.formulaManifestHash,
      inputHash: bundle.inputHash,
      locale: options.locale,
      releasedOn: this.#release.released_on,
    };
    const content = {
      boundaryWarnings,
      evidence,
      omissions,
      reproducibility,
      schemaVersion: "1.0.0" as const,
      suppressions,
      traces,
    };
    return deepFreeze({ ...content, resolutionHash: canonicalHash(content) });
  }
}

export function createDoctrineRegistry(releaseInput: unknown): DoctrineRegistry {
  return new DoctrineRegistry(releaseInput);
}

export function stableResolvedEvidenceBundle(bundle: ResolvedEvidenceBundle): string {
  return stableStringify(bundle);
}
