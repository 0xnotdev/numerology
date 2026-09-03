import { createDoctrineRegistry, type ResolvedEvidenceBundle } from "@numerology/doctrine";
import {
  type CalculationBundle,
  type CalculationRequest,
  calculateBundle,
} from "@numerology/engine";
import { deepFreeze } from "@numerology/shared";
import { writeDeterministicReport } from "./deterministic-writer";
import { parseReportId } from "./ids";
import { planReport } from "./planner";
import { renderStructuredReportHtml } from "./report-renderer";
import type { StructuredReport } from "./structured-report";
import type { ReportPlan } from "./types";
import type { ReportVerificationRecord } from "./verification/types";
import { verifyStructuredReport } from "./verification/verifier";

export const CHECKPOINT4_FIXTURE_REPORT_ID = parseReportId("00000000-0000-4000-8000-000000000004");
export const CHECKPOINT4_FIXTURE_GENERATED_AT = "2026-09-01T00:00:00.000Z";
export const CHECKPOINT4_FIXTURE_DISPLAY_NAME = "Synthetic Subject";
export const CHECKPOINT4_FIXTURE_REQUEST: CalculationRequest = deepFreeze({
  asOfDate: "2026-08-31",
  civilDate: "1990-08-12",
  names: [
    { id: "birth", kind: "birth_full", value: "THOMAS CRUISE MAPOTHER" },
    { id: "popular", kind: "popular", value: "CHX" },
  ],
  profiles: [
    "western_decoz_v1",
    "cheiro_1926_v1",
    "indian_johari_1990_v1",
    "loshu_raw_dob_v1",
    "loshu_indian_augmented_v1",
  ],
  schemaVersion: "1.0.0",
});

export interface CheckpointFourReportFixture {
  readonly bundle: CalculationBundle;
  readonly evidence: ResolvedEvidenceBundle;
  readonly html: string;
  readonly plan: ReportPlan;
  readonly report: StructuredReport;
  readonly verification: ReportVerificationRecord;
}

/** Runs the exact Checkpoint 4 public package pipeline over synthetic, non-customer input. */
export function buildCheckpointFourReportFixture(release: unknown): CheckpointFourReportFixture {
  const bundle = calculateBundle(CHECKPOINT4_FIXTURE_REQUEST);
  const evidence = createDoctrineRegistry(release).resolve(bundle, {
    asOfDate: "2026-09-01",
    locale: "en",
  });
  const plan = planReport(bundle, evidence);
  const report = writeDeterministicReport({
    bundle,
    displayName: CHECKPOINT4_FIXTURE_DISPLAY_NAME,
    evidence,
    generatedAt: CHECKPOINT4_FIXTURE_GENERATED_AT,
    locale: "en-IN",
    plan,
    reportId: CHECKPOINT4_FIXTURE_REPORT_ID,
    reportVersion: 1,
  });
  const verification = verifyStructuredReport({
    bundle,
    comparisonReports: [],
    evidence,
    plan,
    privateValues: [
      CHECKPOINT4_FIXTURE_REQUEST.civilDate,
      ...CHECKPOINT4_FIXTURE_REQUEST.names.map((name) => name.value),
    ],
    report,
    restrictedSourceTexts: [
      "An independent synthetic comparison passage is kept outside the report.",
    ],
    verifiedAt: CHECKPOINT4_FIXTURE_GENERATED_AT,
  });
  if (!verification.valid) {
    throw new RangeError(
      `CHECKPOINT4_FIXTURE_VERIFICATION_FAILED: ${verification.diagnostics.map((item) => item.code).join(",")}`,
    );
  }
  return deepFreeze({
    bundle,
    evidence,
    html: renderStructuredReportHtml(report, bundle),
    plan,
    report,
    verification,
  });
}
