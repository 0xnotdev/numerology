import type { ResolvedEvidenceBundle, SourceId } from "@numerology/doctrine";
import { type CalculationBundle, canonicalHash, parseCalculationBundle } from "@numerology/engine";
import { parseReportId, type ReportId } from "./ids";
import { createStructuredReport } from "./report-serialization";
import {
  DETERMINISTIC_WRITER_POLICY_VERSION,
  REPORT_RENDERER_VERSION,
  REPORT_SAFETY_POLICY_VERSION,
  REPORT_VERIFIER_VERSION,
} from "./report-versions";
import type { StructuredReport, SupportedReportLocale } from "./structured-report";
import type { ReportPlan } from "./types";
import { validateReportPlan } from "./validation";
import { writeClaims } from "./writer-claims";
import {
  DETERMINISTIC_LOCALE_PACK_VERSION,
  DETERMINISTIC_WRITER_VERSION,
  deterministicLocalePack,
} from "./writer-locale";
import { writeSections } from "./writer-sections";

export interface DeterministicReportInput {
  readonly bundle: CalculationBundle;
  readonly displayName: string;
  readonly evidence: ResolvedEvidenceBundle;
  readonly generatedAt: string;
  readonly locale: SupportedReportLocale;
  readonly plan: ReportPlan;
  readonly reportId: ReportId;
  readonly reportVersion: number;
}

export class DeterministicWriterError extends RangeError {
  constructor(public readonly code: string) {
    super(code);
    this.name = "DeterministicWriterError";
  }
}

function assertWriterBoundary(input: DeterministicReportInput): CalculationBundle {
  const generatedAt =
    typeof input.generatedAt === "string" ? new Date(input.generatedAt) : new Date(Number.NaN);
  if (
    typeof input.displayName !== "string" ||
    input.displayName.normalize("NFC").trim().length === 0 ||
    input.displayName.normalize("NFC").length > 120 ||
    typeof input.generatedAt !== "string" ||
    Number.isNaN(generatedAt.valueOf()) ||
    generatedAt.toISOString() !== input.generatedAt ||
    !Number.isInteger(input.reportVersion) ||
    input.reportVersion < 1
  ) {
    throw new DeterministicWriterError("WRITER_INPUT_METADATA_INVALID");
  }
  try {
    parseReportId(input.reportId);
  } catch {
    throw new DeterministicWriterError("WRITER_REPORT_ID_INVALID");
  }
  let bundle: CalculationBundle;
  try {
    bundle = parseCalculationBundle(input.bundle);
  } catch {
    throw new DeterministicWriterError("WRITER_CALCULATION_BUNDLE_INVALID");
  }
  const planValidation = validateReportPlan(input.plan);
  if (!planValidation.valid) {
    throw new DeterministicWriterError(planValidation.diagnostics[0] ?? "WRITER_PLAN_INVALID");
  }
  try {
    if (
      input.plan.evidenceResolutionHash !== input.evidence.resolutionHash ||
      canonicalHash(input.plan.reproducibility) !== canonicalHash(input.evidence.reproducibility) ||
      input.evidence.reproducibility.calculationBundleHash !== canonicalHash(bundle)
    ) {
      throw new Error("reproducibility mismatch");
    }
  } catch {
    throw new DeterministicWriterError("WRITER_REPRODUCIBILITY_MISMATCH");
  }
  if (input.plan.claims.length < 12 || input.plan.claims.length > 80) {
    throw new DeterministicWriterError("WRITER_CLAIM_CARDINALITY");
  }
  const expectedDoctrineLocale = input.locale === "en-IN" ? "en" : input.locale.slice(0, 2);
  if (input.evidence.reproducibility.locale !== expectedDoctrineLocale) {
    throw new DeterministicWriterError("WRITER_LOCALE_MISMATCH");
  }
  return bundle;
}

function sourceIds(plan: ReportPlan): readonly SourceId[] {
  return [...new Set(plan.claims.flatMap((claim) => claim.sourceIds))].sort();
}

/**
 * Permanent deterministic outage writer. It only realizes already-planned claims and never calculates,
 * retrieves doctrine, performs I/O, or introduces a model/prompt authority.
 */
export function writeDeterministicReport(input: DeterministicReportInput): StructuredReport {
  const bundle = assertWriterBoundary(input);
  let locale: ReturnType<typeof deterministicLocalePack>;
  try {
    locale = deterministicLocalePack(input.locale);
  } catch {
    throw new DeterministicWriterError("WRITER_LOCALE_UNAVAILABLE");
  }
  const claims = writeClaims(input.plan.claims, input.plan.actions);
  const sections = writeSections({
    actions: input.plan.actions,
    claims,
    facts: bundle.facts,
    locale,
    sections: input.plan.sections,
    sourceIds: sourceIds(input.plan),
  });
  return createStructuredReport({
    claims,
    disclaimerKey: "reflective-not-scientific-v1",
    displayName: input.displayName.normalize("NFC"),
    generatedAt: input.generatedAt,
    locale: input.locale,
    reportId: input.reportId,
    reportVersion: input.reportVersion,
    schemaVersion: "1.0.0",
    sections,
    title: locale.reportTitle,
    versions: {
      doctrine: input.plan.reproducibility.doctrineReleaseId,
      doctrineHash: input.plan.reproducibility.doctrineReleaseHash,
      engine: input.plan.reproducibility.engineVersion,
      formulaManifest: input.plan.reproducibility.formulaManifestHash,
      inputHash: input.plan.reproducibility.inputHash,
      localePack: DETERMINISTIC_LOCALE_PACK_VERSION,
      planner: input.plan.plannerVersion,
      renderer: REPORT_RENDERER_VERSION,
      reportSchema: "1.0.0",
      safetyPolicy: REPORT_SAFETY_POLICY_VERSION,
      verifier: REPORT_VERIFIER_VERSION,
      writer: DETERMINISTIC_WRITER_VERSION,
      writerPolicy: DETERMINISTIC_WRITER_POLICY_VERSION,
    },
  });
}
