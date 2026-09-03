import type { ResolvedEvidenceBundle } from "@numerology/doctrine";
import {
  type CalculationBundle,
  canonicalHash,
  parseCalculationBundle,
  stableStringify,
} from "@numerology/engine";
import { z } from "zod";
import { hasValidStructuredReportHash } from "../report-serialization";
import { REPORT_VERIFICATION_SCHEMA_VERSION, REPORT_VERIFIER_VERSION } from "../report-versions";
import {
  parseStructuredReport,
  type StructuredReport,
  structuredReportSchema,
} from "../structured-report";
import type { ReportPlan } from "../types";
import { validateReportPlan } from "../validation";
import {
  checkCompleteness,
  checkGenericity,
  checkLanguage,
  checkLength,
  checkPii,
  checkProseProvenance,
  checkRepetition,
  checkSafety,
  checkSimilarity,
} from "./content-gates";
import { diagnostic, type GateCheck, sortDiagnostics } from "./diagnostics";
import {
  checkContradictions,
  checkFactLinkage,
  checkNumeric,
  checkRuleSource,
  checkSchoolBoundary,
} from "./provenance-gates";
import { reportTextSpans } from "./text";
import {
  parseReportVerificationRecord,
  type ReportVerificationRecord,
  VERIFICATION_GATES,
  type VerificationDiagnostic,
  type VerificationGateName,
} from "./types";

export interface ReportVerificationInput {
  readonly bundle: CalculationBundle;
  readonly comparisonReports: readonly StructuredReport[];
  readonly evidence: ResolvedEvidenceBundle;
  readonly plan: ReportPlan;
  readonly privateValues?: readonly string[];
  readonly report: unknown;
  readonly restrictedSourceTexts: readonly string[];
  readonly verifiedAt: string;
}

export class ReportVerificationContextError extends RangeError {
  constructor(public readonly code: string) {
    super(code);
    this.name = "ReportVerificationContextError";
  }
}

function assertContext(input: ReportVerificationInput): CalculationBundle {
  let bundle: CalculationBundle;
  try {
    bundle = parseCalculationBundle(input.bundle);
  } catch {
    throw new ReportVerificationContextError("VERIFIER_CALCULATION_BUNDLE_INVALID");
  }
  const planValidation = validateReportPlan(input.plan);
  if (!planValidation.valid) {
    throw new ReportVerificationContextError(
      planValidation.diagnostics[0] ?? "VERIFIER_PLAN_INVALID",
    );
  }
  try {
    const { resolutionHash: _resolutionHash, ...evidenceContent } = input.evidence;
    if (
      canonicalHash(evidenceContent) !== input.evidence.resolutionHash ||
      input.plan.evidenceResolutionHash !== input.evidence.resolutionHash ||
      input.evidence.reproducibility.calculationBundleHash !== canonicalHash(bundle)
    ) {
      throw new Error("identity mismatch");
    }
  } catch {
    throw new ReportVerificationContextError("VERIFIER_EVIDENCE_IDENTITY_MISMATCH");
  }
  return bundle;
}

function schemaCheck(input: unknown): {
  readonly check: GateCheck;
  readonly report?: StructuredReport;
} {
  const parsed = structuredReportSchema.safeParse(input);
  if (!parsed.success) {
    return {
      check: {
        checkedCount: 1,
        diagnostics: parsed.error.issues.map((issue) =>
          diagnostic("schema", "REPORT_SCHEMA_INVALID", {
            path: issue.path.map(String).join(".") || "$",
          }),
        ),
      },
    };
  }
  const report = parseStructuredReport(parsed.data);
  return {
    check: {
      checkedCount: 2,
      diagnostics: hasValidStructuredReportHash(report)
        ? []
        : [diagnostic("schema", "REPORT_HASH_MISMATCH", { path: "reportHash" })],
    },
    report,
  };
}

function unavailableCheck(gate: VerificationGateName): GateCheck {
  return {
    checkedCount: 0,
    diagnostics: [diagnostic(gate, "REPORT_SCHEMA_UNAVAILABLE")],
  };
}

function comparisonText(report: StructuredReport): string {
  return reportTextSpans(report)
    .filter((span) => span.path !== "displayName")
    .map((span) => span.text)
    .join("\n");
}

function recordFor(
  input: ReportVerificationInput,
  bundle: CalculationBundle,
  report: StructuredReport | undefined,
  checks: ReadonlyMap<VerificationGateName, GateCheck>,
): ReportVerificationRecord {
  const diagnostics = sortDiagnostics(
    VERIFICATION_GATES.flatMap((gate) => checks.get(gate)?.diagnostics ?? []),
  );
  const gates = VERIFICATION_GATES.map((gate) => {
    const check = checks.get(gate) ?? unavailableCheck(gate);
    const diagnosticCodes = [...new Set(check.diagnostics.map((item) => item.code))].sort();
    return {
      checkedCount: check.checkedCount,
      diagnosticCodes,
      gate,
      passed: diagnosticCodes.length === 0,
    };
  });
  const content = {
    calculationBundleHash: canonicalHash(bundle),
    diagnostics,
    evidenceResolutionHash: input.evidence.resolutionHash,
    gates,
    planHash: input.plan.planHash,
    reportHash: report?.reportHash ?? null,
    schemaVersion: REPORT_VERIFICATION_SCHEMA_VERSION,
    valid: diagnostics.length === 0,
    verifiedAt: input.verifiedAt,
    verifierVersion: REPORT_VERIFIER_VERSION,
  } as const;
  return parseReportVerificationRecord({ ...content, recordHash: canonicalHash(content) });
}

/** Runs every critical report gate and returns stable, prose-free diagnostics. */
export function verifyStructuredReport(input: ReportVerificationInput): ReportVerificationRecord {
  const bundle = assertContext(input);
  const schema = schemaCheck(input.report);
  const checks = new Map<VerificationGateName, GateCheck>([["schema", schema.check]]);
  const report = schema.report;
  if (report === undefined) {
    for (const gate of VERIFICATION_GATES) {
      if (gate !== "schema") {
        checks.set(gate, unavailableCheck(gate));
      }
    }
    return recordFor(input, bundle, undefined, checks);
  }

  checks.set("numeric", checkNumeric(report, input.plan));
  checks.set("fact_linkage", checkFactLinkage(report, bundle, input.plan));
  checks.set("rule_source", checkRuleSource(report, input.evidence, input.plan));
  checks.set("school_boundary", checkSchoolBoundary(report, bundle, input.plan));
  checks.set("contradiction", checkContradictions(report, input.plan));
  checks.set("completeness", checkCompleteness(report, input.plan));
  checks.set("prose_provenance", checkProseProvenance(report, input.plan));
  checks.set("length", checkLength(report, input.plan));
  checks.set("repetition", checkRepetition(report));
  checks.set("genericity", checkGenericity(report));
  checks.set("language", checkLanguage(report, input.evidence.reproducibility.locale));
  checks.set("safety", checkSafety(report, input.plan));
  checks.set(
    "similarity",
    checkSimilarity(
      report,
      input.comparisonReports.map(comparisonText),
      input.restrictedSourceTexts,
    ),
  );
  checks.set("pii", checkPii(report, input.privateValues ?? []));
  return recordFor(input, bundle, report, checks);
}

export function stableVerificationRecord(record: ReportVerificationRecord): string {
  return stableStringify(record);
}

export function verificationSchemaDiagnostics(error: unknown): readonly VerificationDiagnostic[] {
  return error instanceof z.ZodError
    ? error.issues.map((issue) =>
        diagnostic("schema", "REPORT_SCHEMA_INVALID", {
          path: issue.path.map(String).join(".") || "$",
        }),
      )
    : [diagnostic("schema", "REPORT_SCHEMA_INVALID")];
}
