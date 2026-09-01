import ruleSchema from "@numerology/doctrine-data/rule.schema.json" with { type: "json" };
import { canonicalHash } from "@numerology/engine";
import { deepFreeze } from "@numerology/shared";
import Ajv2020, { type ErrorObject } from "ajv/dist/2020.js";
import type { DoctrineDiagnostic } from "./diagnostics";
import { freezeDiagnostics } from "./diagnostics";
import { isSourceId, parseRuleId, parseSourceId, type RuleId, type SourceId } from "./ids";

export const RULE_STATUSES = ["draft", "active", "deprecated", "retracted"] as const;
export const RULE_TYPES = [
  "formula",
  "interpretation",
  "combination",
  "timing",
  "remedy",
  "normalization",
  "safety",
] as const;
export const CLAIM_CLASSES = ["A", "B", "C", "D", "E", "F", "G"] as const;
export const RULE_CONFIDENCES = ["high", "medium", "low", "unresolved"] as const;
export const REVIEW_STATES = ["unreviewed", "in_review", "approved", "rejected"] as const;

export type RuleStatus = (typeof RULE_STATUSES)[number];
export type RuleType = (typeof RULE_TYPES)[number];
export type ClaimClass = (typeof CLAIM_CLASSES)[number];
export type RuleConfidence = (typeof RULE_CONFIDENCES)[number];
export type ReviewState = (typeof REVIEW_STATES)[number];

export interface CanonicalRuleThemes {
  readonly constructive: readonly string[];
  readonly tensions: readonly string[];
}

export interface CanonicalSourceLink {
  readonly extraction_note: string | null;
  readonly locator: string;
  readonly source_id: SourceId;
}

/**
 * Compiled representation of every property in data/rule.schema.json.
 * Optional source fields are normalized to explicit nulls, empty collections, or the schema default.
 */
export interface CanonicalDoctrineRule {
  readonly agreement_group: string | null;
  readonly claim_class: ClaimClass;
  readonly confidence: RuleConfidence;
  readonly content_hash: string | null;
  readonly contradiction_ids: readonly string[];
  readonly locale: string;
  readonly metric_id: string | null;
  readonly position_semantics: string | null;
  readonly prohibited_phrases: readonly string[];
  readonly profile_id: string;
  readonly review_state: ReviewState;
  readonly reviewers: readonly string[];
  readonly rule_id: RuleId;
  readonly rule_type: RuleType;
  readonly rule_version: string;
  readonly safe_paraphrases: readonly string[];
  readonly source_links: readonly CanonicalSourceLink[];
  readonly status: RuleStatus;
  readonly themes: CanonicalRuleThemes;
  readonly trigger: Readonly<Record<string, unknown>>;
  readonly valid_from: string | null;
  readonly valid_to: string | null;
}

/** Compile-time complete key map used by runtime schema-parity verification. */
export const CANONICAL_RULE_RUNTIME_FIELDS = Object.freeze({
  agreement_group: true,
  claim_class: true,
  confidence: true,
  content_hash: true,
  contradiction_ids: true,
  locale: true,
  metric_id: true,
  position_semantics: true,
  prohibited_phrases: true,
  profile_id: true,
  review_state: true,
  reviewers: true,
  rule_id: true,
  rule_type: true,
  rule_version: true,
  safe_paraphrases: true,
  source_links: true,
  status: true,
  themes: true,
  trigger: true,
  valid_from: true,
  valid_to: true,
} satisfies Readonly<Record<keyof CanonicalDoctrineRule, true>>);

export const CANONICAL_RULE_SCHEMA = deepFreeze(structuredClone(ruleSchema));
export const CANONICAL_RULE_SCHEMA_HASH = canonicalHash(CANONICAL_RULE_SCHEMA);

function isIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (match === null) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) {
    return false;
  }
  const date = new Date(Date.UTC(year, month, 0));
  return day <= date.getUTCDate();
}

const ajv = new Ajv2020({ allErrors: true, strict: true });
ajv.addFormat("date", { type: "string", validate: isIsoDate });
const validateRuleWire = ajv.compile(ruleSchema);

function errorPath(error: ErrorObject): string {
  const suffix =
    error.keyword === "required" && typeof error.params.missingProperty === "string"
      ? `/${error.params.missingProperty}`
      : error.keyword === "additionalProperties" &&
          typeof error.params.additionalProperty === "string"
        ? `/${error.params.additionalProperty}`
        : "";
  const pointer = `${error.instancePath}${suffix}`;
  return pointer === "" ? "$" : pointer.slice(1).replaceAll("/", ".");
}

function schemaDiagnostics(errors: readonly ErrorObject[]): readonly DoctrineDiagnostic[] {
  return freezeDiagnostics(
    errors.map((error) => ({
      code: "CANONICAL_RULE_SCHEMA_INVALID",
      message: error.message ?? error.keyword,
      path: errorPath(error),
    })),
  );
}

export type CanonicalRuleParseResult =
  | { readonly diagnostics: readonly DoctrineDiagnostic[]; readonly value?: never }
  | { readonly diagnostics: readonly []; readonly value: CanonicalDoctrineRule };

export function parseCanonicalRule(input: unknown): CanonicalRuleParseResult {
  const wire = structuredClone(input);
  if (!validateRuleWire(wire)) {
    return { diagnostics: schemaDiagnostics(validateRuleWire.errors ?? []) };
  }

  // AJV owns structural validation. These checks are the identifier brand boundary.
  const candidate = wire as Record<string, unknown>;
  const diagnostics: DoctrineDiagnostic[] = [];
  const sourceLinks = candidate.source_links as readonly Record<string, unknown>[];
  sourceLinks.forEach((link, index) => {
    if (!isSourceId(link.source_id)) {
      diagnostics.push({
        code: "INVALID_SOURCE_ID",
        message: "source_id is not a valid branded source identifier.",
        path: `source_links.${index}.source_id`,
      });
    }
  });
  if (diagnostics.length > 0) {
    return { diagnostics: freezeDiagnostics(diagnostics) };
  }

  const themes = candidate.themes as
    | { readonly constructive?: readonly string[]; readonly tensions?: readonly string[] }
    | undefined;
  return {
    diagnostics: [],
    value: {
      agreement_group: (candidate.agreement_group as string | null | undefined) ?? null,
      claim_class: candidate.claim_class as ClaimClass,
      confidence: candidate.confidence as RuleConfidence,
      content_hash: (candidate.content_hash as string | null | undefined) ?? null,
      contradiction_ids: (candidate.contradiction_ids as readonly string[] | undefined) ?? [],
      locale: (candidate.locale as string | undefined) ?? "en",
      metric_id: (candidate.metric_id as string | null | undefined) ?? null,
      position_semantics: (candidate.position_semantics as string | null | undefined) ?? null,
      prohibited_phrases: (candidate.prohibited_phrases as readonly string[] | undefined) ?? [],
      profile_id: candidate.profile_id as string,
      review_state: candidate.review_state as ReviewState,
      reviewers: (candidate.reviewers as readonly string[] | undefined) ?? [],
      rule_id: parseRuleId(candidate.rule_id),
      rule_type: candidate.rule_type as RuleType,
      rule_version: candidate.rule_version as string,
      safe_paraphrases: (candidate.safe_paraphrases as readonly string[] | undefined) ?? [],
      source_links: sourceLinks.map((link) => ({
        extraction_note: (link.extraction_note as string | null | undefined) ?? null,
        locator: link.locator as string,
        source_id: parseSourceId(link.source_id),
      })),
      status: candidate.status as RuleStatus,
      themes: {
        constructive: themes?.constructive ?? [],
        tensions: themes?.tensions ?? [],
      },
      trigger: candidate.trigger as Readonly<Record<string, unknown>>,
      valid_from: (candidate.valid_from as string | null | undefined) ?? null,
      valid_to: (candidate.valid_to as string | null | undefined) ?? null,
    },
  };
}
