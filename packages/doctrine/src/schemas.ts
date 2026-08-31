import { PROFILE_IDS } from "@numerology/engine";
import { z } from "zod";

export const DOCTRINE_SCHEMA_VERSION = "1.0.0" as const;
export const DOCTRINE_LOCALES = ["en", "hi", "or"] as const;

const identifier = z.string().trim().min(1);
const semanticVersion = z.string().regex(/^\d+\.\d+\.\d+$/u);
const localizedAtomsSchema = z.strictObject({
  en: z.array(identifier).min(1),
  hi: z.array(identifier).default([]),
  or: z.array(identifier).default([]),
});

export const conditionSchemaV1 = z.discriminatedUnion("op", [
  z.strictObject({
    op: z.literal("eq"),
    path: identifier,
    value: z.union([z.string(), z.number().finite()]),
  }),
  z.strictObject({
    op: z.literal("contains"),
    path: identifier,
    value: z.string(),
  }),
  z.strictObject({
    op: z.literal("gte"),
    path: identifier,
    value: z.number().finite(),
  }),
]);

export const sourceReferenceSchemaV1 = z.strictObject({
  evidenceClass: z.enum(["primary", "authoritative_practitioner", "derived_product_policy"]),
  locator: identifier,
  sourceId: identifier,
});

export const ruleSchemaV1 = z.strictObject({
  actionKeys: z.array(identifier).max(5),
  claims: localizedAtomsSchema,
  conditions: z.array(conditionSchemaV1).min(1),
  confidence: z.enum(["high", "medium", "low"]),
  exclusions: z.array(identifier).default([]),
  metricId: identifier,
  profileId: z.enum(PROFILE_IDS),
  ruleId: z.string().regex(/^[a-z0-9][a-z0-9._-]+$/u),
  safetyTags: z.array(identifier).default([]),
  sourceRefs: z.array(sourceReferenceSchemaV1).min(1),
  status: z.enum(["active", "experimental", "deprecated", "blocked"]),
  themes: z.array(identifier).min(1),
  valence: z.enum(["strength", "tension", "contextual", "neutral"]),
  version: identifier,
});

export const sourceRecordSchemaV1 = z.strictObject({
  creator: identifier,
  locale: z.enum(DOCTRINE_LOCALES),
  sourceId: z.string().regex(/^[A-Z0-9][A-Z0-9_-]+$/u),
  sourceType: z.enum([
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

export const actionRecordSchemaV1 = z.strictObject({
  actionKey: z.string().regex(/^[a-z0-9][a-z0-9._-]+$/u),
  instructions: z.strictObject({
    en: z.array(identifier).min(1),
    hi: z.array(identifier).optional(),
    or: z.array(identifier).optional(),
  }),
  safetyTags: z.array(identifier),
  status: z.enum(["active", "blocked"]),
  version: semanticVersion,
});

export const contradictionRecordSchemaV1 = z.strictObject({
  contradictionId: z.string().regex(/^[A-Z0-9][A-Z0-9_-]+$/u),
  dimension: identifier,
  positionA: identifier,
  positionB: identifier,
  profileA: identifier,
  profileB: identifier,
  resolution: identifier,
});

export const doctrineAuthoringReleaseSchemaV1 = z.strictObject({
  actions: z.array(actionRecordSchemaV1),
  contradictions: z.array(contradictionRecordSchemaV1),
  locales: z.array(z.enum(DOCTRINE_LOCALES)).min(1),
  promotions: z.array(identifier).default([]),
  releaseId: z.string().regex(/^[a-z0-9][a-z0-9._-]+$/u),
  rules: z.array(ruleSchemaV1).min(1),
  schemaVersion: z.literal(DOCTRINE_SCHEMA_VERSION),
  sources: z.array(sourceRecordSchemaV1).min(1),
});

export type DoctrineLocale = (typeof DOCTRINE_LOCALES)[number];
export type DoctrineCondition = z.infer<typeof conditionSchemaV1>;
export type SourceReference = z.infer<typeof sourceReferenceSchemaV1>;
export type DoctrineRule = z.infer<typeof ruleSchemaV1>;
export type DoctrineSource = z.infer<typeof sourceRecordSchemaV1>;
export type DoctrineAction = z.infer<typeof actionRecordSchemaV1>;
export type DoctrineContradiction = z.infer<typeof contradictionRecordSchemaV1>;
export type DoctrineAuthoringRelease = z.infer<typeof doctrineAuthoringReleaseSchemaV1>;
