import type { ProfileId } from "@numerology/engine";
import type { ZodIssue } from "zod";
import { z } from "zod";
import { parseCanonicalRule, type CanonicalDoctrineRule } from "./canonical-rule";
import type { DoctrineDiagnostic } from "./diagnostics";
import { freezeDiagnostics } from "./diagnostics";
import {
  isActionId,
  isRuleId,
  isSourceId,
  parseActionId,
  parseRuleId,
  parseSourceId,
  type RuleId,
} from "./ids";

export const DOCTRINE_SCHEMA_VERSION = "1.0.0" as const;

const identifier = z.string().trim().min(1);
const semver = z.string().regex(/^\d+\.\d+\.\d+$/u);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const ruleId = z.string().refine(isRuleId, "Invalid rule identifier.").transform(parseRuleId);
const sourceId = z
  .string()
  .refine(isSourceId, "Invalid source identifier.")
  .transform(parseSourceId);
const actionId = z
  .string()
  .refine(isActionId, "Invalid action identifier.")
  .transform(parseActionId);

export const doctrineSourceSchema = z.strictObject({
  creator: identifier,
  locale: identifier,
  source_id: sourceId,
  source_type: z.enum([
    "historical_primary",
    "practitioner_primary",
    "peer_reviewed",
    "standard",
    "regulator",
    "product_policy",
  ]),
  status: z.enum(["active", "blocked"]),
  title: identifier,
});

export const doctrineActionSchema = z.strictObject({
  action_id: actionId,
  instructions: z.record(identifier, z.array(identifier).min(1)),
  safety_tags: z.array(identifier),
  status: z.enum(["active", "blocked"]),
  version: semver,
});

export const doctrineRuleBindingSchema = z.strictObject({
  action_ids: z.array(actionId).max(5),
  rule_id: ruleId,
  safety_tags: z.array(identifier),
  section_key: identifier,
  suppresses_rule_ids: z.array(ruleId),
});

export const doctrineContradictionSchema = z.strictObject({
  contradiction_id: identifier,
  dimension: identifier,
  position_a: identifier,
  position_b: identifier,
  profile_a: identifier,
  profile_b: identifier,
  resolution: identifier,
});

const releaseEnvelopeSchema = z.strictObject({
  actions: z.array(doctrineActionSchema),
  bindings: z.array(doctrineRuleBindingSchema),
  contradictions: z.array(doctrineContradictionSchema),
  locales: z.array(identifier).min(1),
  release_id: identifier,
  released_on: isoDate,
  rules: z.array(z.unknown()).min(1),
  schema_version: z.literal(DOCTRINE_SCHEMA_VERSION),
  sources: z.array(doctrineSourceSchema).min(1),
});

export type DoctrineSource = z.infer<typeof doctrineSourceSchema>;
export type DoctrineAction = z.infer<typeof doctrineActionSchema>;
export type DoctrineRuleBinding = z.infer<typeof doctrineRuleBindingSchema>;
export type DoctrineContradiction = z.infer<typeof doctrineContradictionSchema>;

export interface DoctrineAuthoringRelease {
  readonly actions: readonly DoctrineAction[];
  readonly bindings: readonly DoctrineRuleBinding[];
  readonly contradictions: readonly DoctrineContradiction[];
  readonly locales: readonly string[];
  readonly release_id: string;
  readonly released_on: string;
  readonly rules: readonly CanonicalDoctrineRule[];
  readonly schema_version: typeof DOCTRINE_SCHEMA_VERSION;
  readonly sources: readonly DoctrineSource[];
}

export interface DoctrineIndex {
  readonly byProfileMetricRoot: Readonly<
    Record<string, Readonly<Record<string, Readonly<Record<string, readonly RuleId[]>>>>>
  >;
}

export interface CompiledDoctrineRelease extends DoctrineAuthoringRelease {
  readonly index: DoctrineIndex;
  readonly release_hash: string;
}

export interface DoctrineReleaseManifest {
  readonly action_count: number;
  readonly canonical_rule_schema_hash: string;
  readonly contradiction_count: number;
  readonly doctrine_hash: string;
  readonly locales: readonly string[];
  readonly profile_ids: readonly ProfileId[];
  readonly release_id: string;
  readonly released_on: string;
  readonly rule_count: number;
  readonly schema_version: typeof DOCTRINE_SCHEMA_VERSION;
  readonly source_count: number;
}

export interface CompiledDoctrine {
  readonly canonicalJson: string;
  readonly manifest: DoctrineReleaseManifest;
  readonly release: CompiledDoctrineRelease;
}

function issuePath(issue: ZodIssue): string {
  const extraKeys =
    issue.code === "unrecognized_keys" && "keys" in issue
      ? (issue.keys as readonly PropertyKey[])
      : [];
  return [...issue.path, ...extraKeys].map(String).join(".") || "$";
}

function envelopeDiagnostics(issues: readonly ZodIssue[]): readonly DoctrineDiagnostic[] {
  return freezeDiagnostics(
    issues.map((issue) => ({
      code: "RELEASE_SCHEMA_INVALID",
      message: issue.message,
      path: issuePath(issue),
    })),
  );
}

export type AuthoringParseResult =
  | { readonly diagnostics: readonly DoctrineDiagnostic[]; readonly value?: never }
  | { readonly diagnostics: readonly []; readonly value: DoctrineAuthoringRelease };

export function parseDoctrineAuthoringRelease(input: unknown): AuthoringParseResult {
  const envelope = releaseEnvelopeSchema.safeParse(input);
  if (!envelope.success) {
    return { diagnostics: envelopeDiagnostics(envelope.error.issues) };
  }

  const diagnostics: DoctrineDiagnostic[] = [];
  const rules: CanonicalDoctrineRule[] = [];
  envelope.data.rules.forEach((wire, index) => {
    const parsed = parseCanonicalRule(wire);
    if (parsed.value === undefined) {
      diagnostics.push(
        ...parsed.diagnostics.map((diagnostic) => ({
          ...diagnostic,
          path: `rules.${index}.${diagnostic.path}`,
        })),
      );
    } else {
      rules.push(parsed.value);
    }
  });
  if (diagnostics.length > 0) {
    return { diagnostics: freezeDiagnostics(diagnostics) };
  }

  return {
    diagnostics: [],
    value: {
      actions: envelope.data.actions,
      bindings: envelope.data.bindings,
      contradictions: envelope.data.contradictions,
      locales: envelope.data.locales,
      release_id: envelope.data.release_id,
      released_on: envelope.data.released_on,
      rules,
      schema_version: envelope.data.schema_version,
      sources: envelope.data.sources,
    },
  };
}
