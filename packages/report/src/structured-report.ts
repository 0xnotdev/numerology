import { isRuleId, isSourceId, parseRuleId, parseSourceId } from "@numerology/doctrine";
import { isFactId, parseFactId } from "@numerology/engine";
import { deepFreeze } from "@numerology/shared";
import { z } from "zod";
import {
  isReportClaimId,
  isReportId,
  isReportSectionId,
  parseReportClaimId,
  parseReportId,
  parseReportSectionId,
} from "./ids";

export const STRUCTURED_REPORT_SCHEMA_VERSION = "1.0.0" as const;
export const STRUCTURED_REPORT_DISCLAIMER_KEY = "reflective-not-scientific-v1" as const;
export const SUPPORTED_REPORT_LOCALES = ["en-IN", "hi-IN", "or-IN"] as const;

const nonemptyText = z.string().min(1);
const sha256 = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const semver = z.string().regex(/^\d+\.\d+\.\d+$/u);
const instant = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value)) {
    return false;
  }
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
}, "Expected a canonical UTC instant.");

const factId = z.string().refine(isFactId, "Invalid fact identifier.").transform(parseFactId);
const ruleId = z.string().refine(isRuleId, "Invalid rule identifier.").transform(parseRuleId);
const sourceId = z
  .string()
  .refine(isSourceId, "Invalid source identifier.")
  .transform(parseSourceId);
const reportId = z
  .string()
  .refine(isReportId, "Invalid report identifier.")
  .transform(parseReportId);
const claimId = z
  .string()
  .refine(isReportClaimId, "Invalid report claim identifier.")
  .transform(parseReportClaimId);
const sectionId = z
  .string()
  .refine(isReportSectionId, "Invalid report section identifier.")
  .transform(parseReportSectionId);

const sentenceProvenance = z.strictObject({
  actionClassification: z.enum(["practical_alternative", "traditional_practice"]).optional(),
  actionRuleTypes: z
    .array(
      z.enum([
        "formula",
        "interpretation",
        "combination",
        "timing",
        "remedy",
        "normalization",
        "safety",
      ]),
    )
    .optional(),
  claimId: claimId.optional(),
  factIds: z.array(factId).max(8),
  kind: z.enum(["action", "claim", "editorial", "method", "safety"]),
  ruleIds: z.array(ruleId).max(8),
  sourceRefs: z.array(sourceId).max(8),
  templateId: z.string().min(1).max(120),
  text: z.string().min(1).max(1_600),
});

export const reportSentenceProvenanceSchema = sentenceProvenance;

const localizedClaimSchema = z.strictObject({
  action: z.string().max(400).optional(),
  actionProvenance: sentenceProvenance.optional(),
  body: z.array(z.string().min(1).max(1_600)).min(1).max(128),
  heading: z.string().min(1).max(140),
  sentenceProvenance: z.array(sentenceProvenance).min(1).max(128),
});

export const structuredClaimSchema = z.strictObject({
  claimId,
  confidence: z.enum(["high", "medium", "low"]),
  contradictionIds: z.array(z.string().min(1).max(200)),
  displayNumbers: z.array(z.string().min(1)).max(8),
  factIds: z.array(factId).min(1),
  kind: z.enum(["finding", "tension", "action", "method_note", "safety_note"]),
  localized: localizedClaimSchema,
  ruleIds: z.array(ruleId).min(1),
  salience: z.number().int().min(0).max(100),
  semanticSummary: z.string().min(1).max(600),
  sourceRefs: z.array(sourceId).min(1),
  themeId: z.string().min(1).max(120),
  traceIds: z.array(z.string().min(1).max(200)).min(1),
});

const proseBlockSchema = z.strictObject({
  paragraphs: z.array(z.string().min(1).max(1_600)).min(1).max(128),
  sentenceProvenance: z.array(sentenceProvenance).min(1).max(128),
  type: z.literal("prose"),
});

const numberCardBlockSchema = z.strictObject({
  caption: z.string().min(1).max(400),
  captionProvenance: sentenceProvenance,
  factId,
  type: z.literal("number_card"),
});

const comparisonBlockSchema = z.strictObject({
  body: z.string().min(1).max(1_600),
  bodyProvenance: sentenceProvenance,
  leftFactId: factId,
  rightFactId: factId,
  type: z.literal("comparison"),
});

const loShuBlockSchema = z.strictObject({
  caption: z.string().min(1).max(400),
  captionProvenance: sentenceProvenance,
  gridFactId: factId,
  type: z.literal("lo_shu"),
});

const timelineBlockSchema = z.strictObject({
  items: z
    .array(
      z.strictObject({
        claimId,
        factId,
        label: z.string().min(1).max(120),
        provenance: sentenceProvenance,
      }),
    )
    .min(1)
    .max(12),
  type: z.literal("timeline"),
});

const sourceNoteBlockSchema = z.strictObject({
  body: z.string().min(1).max(1_600),
  bodyProvenance: sentenceProvenance,
  sourceRefs: z.array(sourceId).min(1),
  type: z.literal("source_note"),
});

export const reportBlockSchema = z.discriminatedUnion("type", [
  proseBlockSchema,
  numberCardBlockSchema,
  comparisonBlockSchema,
  loShuBlockSchema,
  timelineBlockSchema,
  sourceNoteBlockSchema,
]);

export const reportSectionSchema = z.strictObject({
  blocks: z.array(reportBlockSchema).min(1),
  claimIds: z.array(claimId),
  dek: z.string().min(1).max(300).optional(),
  order: z.number().int().positive(),
  sectionId,
  templateKey: z.enum([
    "welcome",
    "method",
    "core_number",
    "name_layers",
    "grid",
    "synthesis",
    "strengths",
    "growth_edges",
    "work_money",
    "relationships",
    "timing",
    "monthly_map",
    "actions",
    "methodology_appendix",
  ]),
  title: z.string().min(1).max(140),
});

export const reportVersionsSchema = z.strictObject({
  doctrine: nonemptyText,
  doctrineHash: sha256,
  engine: nonemptyText,
  formulaManifest: sha256,
  inputHash: sha256,
  localePack: semver,
  planner: nonemptyText,
  renderer: semver,
  reportSchema: z.literal(STRUCTURED_REPORT_SCHEMA_VERSION),
  safetyPolicy: semver,
  verifier: semver,
  writer: nonemptyText,
  writerPolicy: nonemptyText,
});

export const structuredReportSchema = z.strictObject({
  claims: z.array(structuredClaimSchema).min(12).max(80),
  disclaimerKey: z.literal(STRUCTURED_REPORT_DISCLAIMER_KEY),
  displayName: z.string().min(1).max(120),
  generatedAt: instant,
  locale: z.enum(SUPPORTED_REPORT_LOCALES),
  reportHash: sha256,
  reportId,
  reportVersion: z.number().int().positive(),
  schemaVersion: z.literal(STRUCTURED_REPORT_SCHEMA_VERSION),
  sections: z.array(reportSectionSchema).min(16).max(20),
  title: z.string().min(1).max(200),
  versions: reportVersionsSchema,
});

type DeepReadonly<T> = T extends string | number | boolean | null | undefined
  ? T
  : T extends (...args: never[]) => unknown
    ? T
    : T extends readonly (infer U)[]
      ? readonly DeepReadonly<U>[]
      : T extends object
        ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
        : T;

export type SentenceProvenance = DeepReadonly<z.output<typeof reportSentenceProvenanceSchema>>;
export type StructuredClaim = DeepReadonly<z.output<typeof structuredClaimSchema>>;
export type ReportBlock = DeepReadonly<z.output<typeof reportBlockSchema>>;
export type ReportSection = DeepReadonly<z.output<typeof reportSectionSchema>>;
export type ReportVersions = DeepReadonly<z.output<typeof reportVersionsSchema>>;
export type StructuredReport = DeepReadonly<z.output<typeof structuredReportSchema>>;
export type SupportedReportLocale = (typeof SUPPORTED_REPORT_LOCALES)[number];

/** Strictly parses and recursively freezes an untrusted durable report object. */
export function parseStructuredReport(input: unknown): StructuredReport {
  return deepFreeze(structuredReportSchema.parse(input));
}
