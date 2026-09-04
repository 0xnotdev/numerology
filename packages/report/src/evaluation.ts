import { createDoctrineRegistry } from "@numerology/doctrine";
import { calculateBundle, fixtureRequest, PROFILE_IDS } from "@numerology/engine";
import { deepFreeze } from "@numerology/shared";
import { CHECKPOINT4_FIXTURE_REQUEST } from "./checkpoint4-fixture";
import { writeDeterministicReport } from "./deterministic-writer";
import { type EvaluationSubject, parseEvaluationCorpus } from "./evaluation-corpus";
import { parseReportId } from "./ids";
import { planReport } from "./planner";
import { rehashStructuredReport } from "./report-serialization";
import type { StructuredReport } from "./structured-report";
import { verifyStructuredReport } from "./verification/verifier";

export const EVALUATION_RUNNER_VERSION = "checkpoint4-golden-evaluation.1.0.0" as const;

export interface EvaluationResult {
  readonly diagnosticCodes: readonly string[];
  readonly inputHash: string | null;
  readonly locale: EvaluationSubject["locale"];
  readonly reportHash: string | null;
  readonly status: "rejected" | "unsupported_locale" | "verified";
  readonly subjectId: string;
}

/** Internal quality seam: keeps the verified synthetic report available for reviewer packets. */
export interface EvaluationExecution {
  readonly report?: StructuredReport;
  readonly result: EvaluationResult;
}

function reportIdFor(index: number) {
  return parseReportId(`00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);
}

function alphaizeDigits(value: string): string {
  return value.replace(/[0-9]/gu, (digit) => String.fromCharCode(65 + Number(digit)));
}

/**
 * Completes a narrow engine vector with the report contract's required name
 * views and profile catalog. The vector's date and name values win on matching
 * ids, so each tagged edge remains executable while the resulting request is
 * still a complete, deterministic Checkpoint 4 intake.
 */
function evaluationRequest(subject: EvaluationSubject) {
  const vector = fixtureRequest(subject.engineFixtureId);
  const names = new Map(CHECKPOINT4_FIXTURE_REQUEST.names.map((name) => [name.id, name]));
  if (subject.adversarialText === null) {
    for (const name of vector.names) {
      names.set(name.id, name);
    }
  } else {
    // Adversarial rows use the complete canonical intake so the writer can
    // reach the verifier's safety/script gates. The referenced vector is
    // retained as a display-only audit value and is never interpreted.
    names.set(`vector-edge-${subject.engineFixtureId}`, {
      id: `vector-edge-${subject.engineFixtureId}`,
      kind: "report_display",
      value: alphaizeDigits(
        `${vector.civilDate} ${vector.names.map((name) => name.value).join(" ")}`,
      ),
    });
  }
  names.set(`evaluation-display-${subject.subjectId}`, {
    id: `evaluation-display-${subject.subjectId}`,
    kind: "report_display",
    value: alphaizeDigits(subject.displayName),
  });
  return {
    ...CHECKPOINT4_FIXTURE_REQUEST,
    asOfDate:
      subject.adversarialText === null ? vector.asOfDate : CHECKPOINT4_FIXTURE_REQUEST.asOfDate,
    civilDate:
      subject.adversarialText === null ? vector.civilDate : CHECKPOINT4_FIXTURE_REQUEST.civilDate,
    names: [...names.values()],
    profiles: PROFILE_IDS,
  } as const;
}

/** Executes the frozen sixty-subject report corpus and retains verified reports for quality tooling. */
export function runEvaluationCorpusWithReports(
  corpusInput: unknown,
  releaseInput: unknown,
): readonly EvaluationExecution[] {
  const subjects = parseEvaluationCorpus(corpusInput);
  const registry = createDoctrineRegistry(releaseInput);
  const results = subjects.map((subject, index): EvaluationExecution => {
    let inputHash: string | null = null;
    try {
      const doctrineLocale = subject.locale.slice(0, 2);
      const bundle = calculateBundle(evaluationRequest(subject));
      inputHash = bundle.inputHash;
      const evidence = registry.resolve(bundle, {
        asOfDate: "2026-09-01",
        locale: doctrineLocale,
      });
      const plan = planReport(bundle, evidence, { minimumIndependentProfileFamilies: 1 });
      const report = writeDeterministicReport({
        bundle,
        displayName: subject.displayName,
        evidence,
        generatedAt: "2026-09-01T00:00:00.000Z",
        locale: subject.locale,
        plan,
        reportId: reportIdFor(index),
        reportVersion: 1,
      });
      const evaluatedReport =
        subject.adversarialText === null
          ? report
          : rehashStructuredReport({
              ...report,
              claims: report.claims.map((claim, claimIndex) =>
                claimIndex === 0
                  ? {
                      ...claim,
                      localized: { ...claim.localized, body: [subject.adversarialText as string] },
                    }
                  : claim,
              ),
            });
      const verification = verifyStructuredReport({
        bundle,
        comparisonReports: [],
        evidence,
        plan,
        report: evaluatedReport,
        restrictedSourceTexts: ["An independent synthetic evaluation passage."],
        verifiedAt: "2026-09-01T00:00:00.000Z",
      });
      return {
        result: {
          diagnosticCodes: [...new Set(verification.diagnostics.map((item) => item.code))].sort(),
          inputHash,
          locale: subject.locale,
          reportHash: verification.valid ? verification.reportHash : null,
          status: verification.valid ? "verified" : "rejected",
          subjectId: subject.subjectId,
        },
        ...(verification.valid ? { report: evaluatedReport } : {}),
      };
    } catch (error) {
      const code =
        (error instanceof Error ? error.message.split(":")[0] : String(error)) ??
        "EVALUATION_UNEXPECTED_ERROR";
      const unsupported =
        code === "UNSUPPORTED_DOCTRINE_LOCALE" || code.includes("LOCALE_UNAVAILABLE");
      return {
        result: {
          diagnosticCodes: [code],
          inputHash,
          locale: subject.locale,
          reportHash: null,
          status: unsupported ? "unsupported_locale" : "rejected",
          subjectId: subject.subjectId,
        },
      };
    }
  });
  return deepFreeze(results);
}

/** Executes the frozen sixty-subject report corpus without a model or network dependency. */
export function runEvaluationCorpus(
  corpusInput: unknown,
  releaseInput: unknown,
): readonly EvaluationResult[] {
  return deepFreeze(
    runEvaluationCorpusWithReports(corpusInput, releaseInput).map(({ result }) => result),
  );
}
