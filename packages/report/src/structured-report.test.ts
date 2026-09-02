import { describe, expect, it } from "vitest";
import {
  hasValidStructuredReportHash,
  parseReportClaimId,
  parseReportId,
  parseReportSectionId,
  parseStructuredReport,
  stableStructuredReport,
} from "./index";
import { buildCheckpointFourTestFixture } from "./test-support";

describe("structured report contract", () => {
  it("strictly parses, brands, freezes, hashes, and serializes the complete golden report", () => {
    const { report } = buildCheckpointFourTestFixture();

    expect(parseStructuredReport(structuredClone(report))).toEqual(report);
    expect(hasValidStructuredReportHash(report)).toBe(true);
    expect(stableStructuredReport(report)).toBe(stableStructuredReport(report));
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.claims[0]?.localized.body)).toBe(true);
    expect(report.claims).toHaveLength(13);
    expect(report.sections).toHaveLength(18);
  });

  it("rejects unknown keys, malformed versions, cardinality, timestamps, and identifiers", () => {
    const { report } = buildCheckpointFourTestFixture();
    const claim = report.claims[0];
    if (claim === undefined) {
      throw new Error("Missing report claim fixture.");
    }
    expect(() => parseStructuredReport({ ...report, unexpected: true })).toThrow();
    expect(() =>
      parseStructuredReport({
        ...report,
        claims: [
          { ...claim, localized: { ...claim.localized, unknown: true } },
          ...report.claims.slice(1),
        ],
      }),
    ).toThrow();
    expect(() =>
      parseStructuredReport({ ...report, claims: report.claims.slice(0, 11) }),
    ).toThrow();
    expect(() => parseStructuredReport({ ...report, generatedAt: "yesterday" })).toThrow();
    expect(() =>
      parseStructuredReport({ ...report, versions: { ...report.versions, reportSchema: "2.0.0" } }),
    ).toThrow();
    expect(() => parseReportId("not-a-uuid")).toThrow("INVALID_REPORT_ID");
    expect(() => parseReportClaimId("free string")).toThrow("INVALID_REPORT_CLAIM_ID");
    expect(() => parseReportSectionId("methodology_appendix")).toThrow("INVALID_REPORT_SECTION_ID");
  });
});
