import { canonicalHash, parseFactId } from "@numerology/engine";
import { describe, expect, it } from "vitest";
import { rehashStructuredReport } from "./report-serialization";
import type { StructuredReport } from "./structured-report";
import { buildCheckpointFourTestFixture } from "./test-support";
import { VERIFICATION_GATES } from "./verification/types";
import { stableVerificationRecord, verifyStructuredReport } from "./verification/verifier";

function verify(
  report: unknown,
  options: {
    readonly comparisonReports?: readonly StructuredReport[];
    readonly privateValues?: readonly string[];
  } = {},
) {
  const fixture = buildCheckpointFourTestFixture();
  return verifyStructuredReport({
    bundle: fixture.bundle,
    ...(options.comparisonReports === undefined
      ? {}
      : { comparisonReports: options.comparisonReports }),
    evidence: fixture.evidence,
    plan: fixture.plan,
    ...(options.privateValues === undefined ? {} : { privateValues: options.privateValues }),
    report,
    verifiedAt: "2026-09-01T00:00:00.000Z",
  });
}

function changedBody(report: StructuredReport, indexes: ReadonlySet<number>, body: string) {
  return rehashStructuredReport({
    ...report,
    claims: report.claims.map((claim, index) =>
      indexes.has(index) ? { ...claim, localized: { ...claim.localized, body: [body] } } : claim,
    ),
  });
}

describe("fail-closed structured report verifier", () => {
  it("passes every critical gate with stable prose-free evidence and hashes", () => {
    const fixture = buildCheckpointFourTestFixture();
    const first = verify(fixture.report, {
      privateValues: ["1990-08-12", "THOMAS CRUISE MAPOTHER", "CHX"],
    });
    const second = verify(structuredClone(fixture.report), {
      privateValues: ["1990-08-12", "THOMAS CRUISE MAPOTHER", "CHX"],
    });

    expect(first.valid).toBe(true);
    expect(first.diagnostics).toEqual([]);
    expect(first.gates.map((gate) => gate.gate)).toEqual(VERIFICATION_GATES);
    expect(first.gates.every((gate) => gate.passed)).toBe(true);
    expect(first.recordHash).toBe(second.recordHash);
    expect(stableVerificationRecord(first)).toBe(stableVerificationRecord(second));
    expect(Object.isFrozen(first.gates)).toBe(true);
  });

  it("reports strict schema and report-hash failures before dependent gates", () => {
    const fixture = buildCheckpointFourTestFixture();
    const malformed = verify({ ...fixture.report, unknown: true });
    expect(malformed.valid).toBe(false);
    expect(malformed.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "REPORT_SCHEMA_INVALID", gate: "schema" }),
        expect.objectContaining({ code: "REPORT_SCHEMA_UNAVAILABLE", gate: "numeric" }),
      ]),
    );

    const hashMismatch = verify({ ...fixture.report, reportHash: `sha256:${"0".repeat(64)}` });
    expect(hashMismatch.diagnostics).toContainEqual(
      expect.objectContaining({ code: "REPORT_HASH_MISMATCH", gate: "schema" }),
    );
  });

  it("rejects invented Arabic/native-digit and number-word assertions", () => {
    const { report } = buildCheckpointFourTestFixture();
    for (const body of [
      "An invented 99 appears here.",
      "An invented ९९ appears here.",
      "An invented ninety nine appears here.",
    ]) {
      const result = verify(changedBody(report, new Set([0]), body));
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({ code: "REPORT_NUMBER_NOT_ALLOWED", gate: "numeric" }),
      );
    }
  });

  it("rejects fact, rule/source, profile, and contradiction drift", () => {
    const fixture = buildCheckpointFourTestFixture();
    const first = fixture.report.claims[0];
    const plannedFirst = fixture.plan.claims.find((claim) => claim.claimId === first?.claimId);
    const alternateFact = fixture.bundle.facts.find(
      (fact) =>
        first !== undefined &&
        !first.factIds.includes(fact.factId) &&
        !plannedFirst?.profileIds.includes(fact.profileId),
    );
    if (first === undefined || alternateFact === undefined) {
      throw new Error("Missing verifier provenance fixture.");
    }
    const factDrift = rehashStructuredReport({
      ...fixture.report,
      claims: [{ ...first, factIds: [alternateFact.factId] }, ...fixture.report.claims.slice(1)],
    });
    const factResult = verify(factDrift);
    expect(factResult.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "REPORT_CLAIM_FACT_LINK_MISMATCH" }),
        expect.objectContaining({ code: "REPORT_PROFILE_BOUNDARY_MISMATCH" }),
      ]),
    );

    const ruleDrift = rehashStructuredReport({
      ...fixture.report,
      claims: [
        { ...first, semanticSummary: "Unsupported semantic replacement." },
        ...fixture.report.claims.slice(1),
      ],
    });
    expect(verify(ruleDrift).diagnostics).toContainEqual(
      expect.objectContaining({ code: "REPORT_CLAIM_SEMANTIC_MISMATCH", gate: "rule_source" }),
    );

    const contradictionIndex = fixture.report.claims.findIndex((claim) =>
      claim.themeId.startsWith("contradiction."),
    );
    const contradiction = fixture.report.claims[contradictionIndex];
    if (contradiction === undefined) {
      throw new Error("Missing contradiction fixture.");
    }
    const unframed = rehashStructuredReport({
      ...fixture.report,
      claims: fixture.report.claims.map((claim, index) =>
        index === contradictionIndex ? { ...claim, kind: "finding" as const } : claim,
      ),
    });
    expect(verify(unframed).diagnostics).toContainEqual(
      expect.objectContaining({ code: "REPORT_CONTRADICTION_UNFRAMED", gate: "contradiction" }),
    );
  });

  it("rejects incomplete, generic, wrong-script, unsafe, similar, and private prose", () => {
    const fixture = buildCheckpointFourTestFixture();
    const incomplete = rehashStructuredReport({
      ...fixture.report,
      sections: fixture.report.sections.slice(0, 17),
    });
    expect(verify(incomplete).diagnostics).toContainEqual(
      expect.objectContaining({ code: "REPORT_SECTION_CARDINALITY", gate: "completeness" }),
    );

    const generic = changedBody(fixture.report, new Set([0, 1, 2]), "A generic reflection.");
    expect(verify(generic).diagnostics).toContainEqual(
      expect.objectContaining({ code: "REPORT_SPECIFICITY_BELOW_THRESHOLD", gate: "genericity" }),
    );

    const wrongScript = changedBody(fixture.report, new Set([0]), "यह गलत लिपि वाला अनुच्छेद है");
    expect(verify(wrongScript).diagnostics).toContainEqual(
      expect.objectContaining({ code: "REPORT_LOCALE_SCRIPT_MISMATCH", gate: "language" }),
    );

    const unsafe = changedBody(fixture.report, new Set([0]), "You will cure disease.");
    expect(verify(unsafe).diagnostics).toContainEqual(
      expect.objectContaining({ code: "REPORT_UNSAFE_LANGUAGE", gate: "safety" }),
    );

    expect(
      verify(fixture.report, { comparisonReports: [fixture.report] }).diagnostics,
    ).toContainEqual(
      expect.objectContaining({ code: "REPORT_LONG_SPAN_SIMILARITY", gate: "similarity" }),
    );

    const pii = changedBody(
      fixture.report,
      new Set([0]),
      "Contact private.person@example.test at 1990-08-12.",
    );
    const piiResult = verify(pii, { privateValues: ["private.person@example.test"] });
    expect(piiResult.diagnostics).toContainEqual(
      expect.objectContaining({ code: "REPORT_PRIVATE_DATA_LEAK", gate: "pii" }),
    );
    expect(JSON.stringify(piiResult.diagnostics)).not.toContain("private.person@example.test");
  });

  it("rejects malformed trusted context instead of producing misleading report diagnostics", () => {
    const fixture = buildCheckpointFourTestFixture();
    expect(() =>
      verifyStructuredReport({
        bundle: fixture.bundle,
        evidence: {
          ...fixture.evidence,
          resolutionHash: canonicalHash({ changed: true }),
        },
        plan: fixture.plan,
        report: fixture.report,
        verifiedAt: "2026-09-01T00:00:00.000Z",
      }),
    ).toThrow("VERIFIER_EVIDENCE_IDENTITY_MISMATCH");
    expect(() => parseFactId("untrusted fact id")).toThrow("INVALID_FACT_ID");
  });
});
