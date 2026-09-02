import { canonicalHash, stableStringify } from "@numerology/engine";
import { deepFreeze } from "@numerology/shared";
import { parseStructuredReport, type StructuredReport } from "./structured-report";

export type StructuredReportWithoutHash = Omit<StructuredReport, "reportHash">;

/** Creates a strictly parsed report whose hash covers every field except the hash itself. */
export function createStructuredReport(input: StructuredReportWithoutHash): StructuredReport {
  return parseStructuredReport({ ...input, reportHash: canonicalHash(input) });
}

export function stableStructuredReport(report: StructuredReport): string {
  return stableStringify(report);
}

export function hasValidStructuredReportHash(report: StructuredReport): boolean {
  const { reportHash: _reportHash, ...content } = report;
  return canonicalHash(content) === report.reportHash;
}

/** Re-hashes a changed report fixture through the same strict production boundary. */
export function rehashStructuredReport(
  input: Omit<StructuredReport, "reportHash"> & { readonly reportHash?: string },
): StructuredReport {
  const { reportHash: _reportHash, ...content } = input;
  return deepFreeze(createStructuredReport(content));
}
