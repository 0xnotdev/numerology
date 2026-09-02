import corpus from "@numerology/doctrine-data/report/eval-subjects.json";
import { parseFactId, type CalculatedFact } from "@numerology/engine";
import { describe, expect, it } from "vitest";
import { buildCheckpointFourTestFixture } from "./test-support";
import { renderStructuredReportHtml } from "./report-renderer";
import { writeSections } from "./writer-sections";
import { writeClaims } from "./writer-claims";
import { buildContradictionCandidates } from "./contradictions";
import { buildClaimCandidates } from "./ranking";
import { deterministicLocalePack } from "./writer-locale";
import { writeDeterministicReport } from "./deterministic-writer";
import { numericTokens, normalizedWords, shingleSimilarity } from "./verification/text";
import { parseReportVerificationRecord } from "./verification/types";
import {
  checkCompleteness,
  checkGenericity,
  checkLanguage,
  checkPii,
  checkSafety,
} from "./verification/content-gates";
import {
  checkFactLinkage,
  checkNumeric,
  checkRuleSource,
  checkSchoolBoundary,
} from "./verification/provenance-gates";
import { parseReportClaimId } from "./ids";
import type { StructuredReport } from "./structured-report";
import { validateReportPlan } from "./validation";
import type { EvaluationSubject } from "./evaluation-corpus";
import { planReport } from "./planner";
import { parseEvaluationCorpus } from "./evaluation-corpus";
import { runReportCli, type ReportCliIo } from "./cli";

type Mutable<T> = T extends string | number | boolean | bigint | null | undefined
  ? T
  : T extends readonly (infer U)[]
    ? Mutable<U>[]
    : T extends object
      ? { -readonly [K in keyof T]: Mutable<T[K]> }
      : T;
type MutableReport = Mutable<StructuredReport>;

function fixture() {
  return buildCheckpointFourTestFixture();
}

describe("report contract boundary cases", () => {
  it("renders missing, empty, and profile-divergent block facts without crashing", () => {
    const current = fixture();
    const report = structuredClone(current.report) as unknown as MutableReport;
    const missing = parseFactId("missing.renderer.fact");
    let addedEmptyCard = false;
    for (const section of report.sections) {
      section.dek = undefined;
      for (const block of section.blocks) {
        if (block.type === "number_card") {
          block.factId = missing;
          if (!addedEmptyCard) {
            section.blocks.push({
              caption: "Empty display-token fact",
              factId: parseFactId("western_decoz_v1.karmic_lessons"),
              type: "number_card",
            });
            addedEmptyCard = true;
          }
        } else if (block.type === "comparison") {
          block.leftFactId = missing;
          block.rightFactId = missing;
        } else if (block.type === "lo_shu") {
          block.gridFactId = missing;
        } else if (block.type === "timeline") {
          const firstItem = block.items[0];
          if (firstItem !== undefined) firstItem.factId = missing;
        }
      }
    }
    const html = renderStructuredReportHtml(report, current.bundle);
    expect(html).toContain("Not displayed");
    expect(html).toContain("Unknown profile");
    expect(html).toContain("Count 0");
    expect(html).toContain("aria-labelledby");
  });

  it("covers every deterministic section fallback and month-label fallback", () => {
    const current = fixture();
    const emptySections = current.plan.sections.map((section) => ({
      ...section,
      claimIds: [],
      reservedFactIds: [],
    }));
    const common = {
      actions: current.plan.actions,
      claims: current.report.claims,
      locale: deterministicLocalePack("en-IN"),
      sourceIds: current.plan.claims.flatMap((claim) => claim.sourceIds),
    };
    const fallback = writeSections({
      ...common,
      facts: current.bundle.facts,
      sections: emptySections,
    });
    expect(fallback).toHaveLength(18);
    const missingClaimSections = emptySections.map((section, index) =>
      index === 0
        ? { ...section, claimIds: [parseReportClaimId("claim.missing-section-claim")] }
        : section,
    );
    expect(
      writeSections({ ...common, facts: current.bundle.facts, sections: missingClaimSections })[0]
        ?.blocks,
    ).toHaveLength(1);
    expect(fallback.every((section) => section.blocks.length > 0)).toBe(true);

    const birthdayFact = current.bundle.facts[0];
    if (birthdayFact === undefined) throw new Error("Missing fact");
    const oneFactSections = current.plan.sections.map((section) =>
      section.key === "birthday_psychic_comparison"
        ? { ...section, claimIds: [], reservedFactIds: [birthdayFact.factId] }
        : section,
    );
    const oneFact = writeSections({
      ...common,
      facts: current.bundle.facts,
      sections: oneFactSections,
    });
    expect(
      oneFact.find((section) => section.sectionId === "section.birthday_psychic_comparison")
        ?.blocks,
    ).toHaveLength(1);

    const month = current.bundle.facts.find((fact) => fact.metricId === "personal_month.01");
    if (month === undefined) throw new Error("Missing month fact");
    const monthWithUnexpectedLabel = {
      ...month,
      metadata: { ...month.metadata, month: 99 },
    } as unknown as CalculatedFact;
    const monthTwo = current.bundle.facts.find((fact) => fact.metricId === "personal_month.02");
    if (monthTwo === undefined) throw new Error("Missing second month fact");
    const monthWithoutMetadata = { ...monthTwo, metadata: undefined } as unknown as CalculatedFact;
    const monthSections = current.plan.sections.map((section) =>
      section.key === "personal_months" ? { ...section, reservedFactIds: [month.factId] } : section,
    );
    const monthReport = writeSections({
      ...common,
      facts: current.bundle.facts.map((fact) =>
        fact.factId === month.factId
          ? monthWithUnexpectedLabel
          : fact.metricId === "personal_month.02"
            ? monthWithoutMetadata
            : fact,
      ),
      sections: monthSections,
    });
    expect(JSON.stringify(monthReport)).toContain("Month 1");
    expect(() =>
      writeSections({
        ...common,
        facts: current.bundle.facts,
        sections: current.plan.sections,
        sourceIds: [],
      }),
    ).toThrow("WRITER_SOURCE_REQUIRED");
  });

  it("exercises number parsing, Unicode normalization, and empty similarity sets", () => {
    expect(numericTokens("one hundred and twenty-three thousand four hundred five")).toContain(
      "123405",
    );
    expect(numericTokens("१२३ और ୪୫")).toEqual(expect.arrayContaining(["123", "45"]));
    expect(numericTokens("symbols only — —")).toEqual([]);
    expect(normalizedWords("  José\u0301  ")).toEqual(["josé"]);
    expect(normalizedWords("— —")).toEqual([]);
    expect(numericTokens("one and blue")).toContain("1");
    expect(numericTokens("thousand")).toContain("1000");
    expect(shingleSimilarity("short", "different", 5)).toBe(0);
    expect(shingleSimilarity("one two three four five", "one two three four five", 5)).toBe(1);
  });

  it("rejects internally inconsistent verification records", () => {
    const current = fixture();
    const record = current.verification;
    expect(() =>
      parseReportVerificationRecord({ ...record, gates: [...record.gates].reverse() }),
    ).toThrow("VERIFICATION_GATE_ORDER_INVALID");
    expect(() =>
      parseReportVerificationRecord({
        ...record,
        gates: record.gates.map((gate, index) => (index === 0 ? { ...gate, passed: false } : gate)),
      }),
    ).toThrow("VERIFICATION_GATE_RESULT_INVALID");
    expect(() => parseReportVerificationRecord({ ...record, valid: false })).toThrow(
      "VERIFICATION_VALIDITY_INVALID",
    );
    expect(() =>
      parseReportVerificationRecord({ ...record, recordHash: `sha256:${"0".repeat(64)}` }),
    ).toThrow("VERIFICATION_RECORD_HASH_MISMATCH");
  });

  it("covers duplicate-valence themes and zero-root candidates", () => {
    const current = fixture();
    const evidence = current.evidence.evidence[0];
    if (evidence === undefined) throw new Error("Missing evidence");
    const fact = current.bundle.facts.find((candidate) => candidate.factId === evidence.factId);
    if (fact === undefined) throw new Error("Missing fact");
    const action = current.plan.actions[0];
    if (action === undefined) throw new Error("Missing action");
    const candidates = buildClaimCandidates(
      [
        {
          ...evidence,
          actionIds: [action.actionId],
          themes: { constructive: ["same"], tensions: ["same"] },
        },
      ],
      new Map([[fact.factId, { ...fact, root: 0 }]]),
    );
    expect(candidates).toHaveLength(2);
    expect(candidates.every((candidate) => candidate.primaryRoot === null)).toBe(true);
  });

  it("rejects malformed deterministic writer inputs with stable codes", () => {
    const current = fixture();
    const input = {
      bundle: current.bundle,
      displayName: "Synthetic Subject",
      evidence: current.evidence,
      generatedAt: "2026-09-01T00:00:00.000Z",
      locale: "en-IN" as const,
      plan: current.plan,
      reportId: current.report.reportId,
      reportVersion: 1,
    };
    expect(() => writeDeterministicReport({ ...input, displayName: " " })).toThrow(
      "WRITER_INPUT_METADATA_INVALID",
    );
    expect(() => writeDeterministicReport({ ...input, generatedAt: "tomorrow" })).toThrow(
      "WRITER_INPUT_METADATA_INVALID",
    );
    expect(() =>
      writeDeterministicReport({ ...input, reportId: "not-an-id" as typeof input.reportId }),
    ).toThrow("WRITER_REPORT_ID_INVALID");
    expect(() =>
      writeDeterministicReport({ ...input, plan: { ...input.plan, planHash: "bad" } }),
    ).toThrow("PLAN_HASH_INVALID");
    expect(() =>
      writeDeterministicReport({
        ...input,
        evidence: {
          ...input.evidence,
          reproducibility: { ...input.evidence.reproducibility, engineVersion: "changed" },
        },
      }),
    ).toThrow("WRITER_REPRODUCIBILITY_MISMATCH");
  });

  it("rejects unresolved claims at the deterministic writer boundary", () => {
    const current = fixture();
    const claim = current.plan.claims[0];
    if (claim === undefined) throw new Error("Missing claim");
    expect(() =>
      writeClaims([{ ...claim, confidence: "unresolved" }], current.plan.actions),
    ).toThrow("WRITER_UNRESOLVED_CLAIM");
  });

  it("covers contradiction sorting and incomplete-fact handling", () => {
    const current = fixture();
    const warning = current.evidence.boundaryWarnings[0];
    if (warning === undefined) throw new Error("Missing contradiction");
    const support = current.evidence.evidence
      .filter(
        (item) => item.profileId === warning.profile_a || item.profileId === warning.profile_b,
      )
      .map((item) => ({ ...item, confidence: "high" as const }));
    const sameRule = support.map((item) => ({
      ...item,
      ruleId: support[0]?.ruleId ?? item.ruleId,
    }));
    const candidates = buildContradictionCandidates(
      [warning],
      sameRule,
      new Map(current.bundle.facts.map((fact) => [fact.factId, fact])),
    );
    expect(candidates).toHaveLength(1);
    const omittedFactId = support[0]?.factId;
    const missingFacts = new Map(
      current.bundle.facts
        .filter((fact) => fact.factId !== omittedFactId)
        .map((fact) => [fact.factId, fact]),
    );
    expect(buildContradictionCandidates([warning], sameRule, missingFacts)).toHaveLength(1);
  });

  it("rejects unsupported deterministic locale packs", () => {
    expect(() => deterministicLocalePack("hi-IN")).toThrow("DETERMINISTIC_LOCALE_UNAVAILABLE");
  });

  it("exercises direct content gates at their defensive boundaries", () => {
    const current = fixture();
    const report = structuredClone(current.report) as unknown as MutableReport;
    const firstSection = report.sections[0];
    if (firstSection === undefined) throw new Error("Missing first section");
    firstSection.title = "changed section title";
    report.sections = report.sections.filter((section) => section.sectionId !== "section.actions");
    (report as { disclaimerKey: string }).disclaimerKey = "missing-disclosure";
    report.claims = [];
    report.title = "";
    expect(checkCompleteness(report, current.plan).diagnostics.length).toBeGreaterThan(0);
    expect(checkGenericity(report).diagnostics).toHaveLength(1);
    expect(checkLanguage(report, undefined).diagnostics).toHaveLength(0);
    expect(checkLanguage({ ...report, locale: "hi-IN", title: "अ" }, "hi").diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "REPORT_LOCALE_SCRIPT_MISMATCH" })]),
    );
    expect(
      checkLanguage({ ...report, locale: "hi-IN", title: "अଅ" }, "en").diagnostics,
    ).toHaveLength(2);
    expect(
      checkLanguage({ ...report, locale: "or-IN", title: "ଅअ" }, "or").diagnostics,
    ).toHaveLength(1);
    expect(checkSafety({ ...report, title: "will" }, current.plan).diagnostics).toContainEqual(
      expect.objectContaining({ code: "REPORT_UNSAFE_LANGUAGE" }),
    );
    expect(
      checkPii({ ...report, displayName: "person@example.test" }, []).diagnostics,
    ).toContainEqual(expect.objectContaining({ path: "displayName" }));
  });

  it("exercises report fact, provenance, numeric, and plan-linkage failures", () => {
    const current = fixture();
    const report = structuredClone(current.report) as unknown as MutableReport;
    const first = report.claims[0];
    if (first === undefined) throw new Error("Missing claim");
    first.claimId = parseReportClaimId("claim.unknown-renderer-claim");
    first.traceIds = ["unknown-trace"];
    first.factIds = [parseFactId("unknown.fact")];
    const evidenceRule = current.evidence.evidence[0];
    if (evidenceRule === undefined) throw new Error("Missing evidence");
    first.ruleIds = [evidenceRule.ruleId];
    report.title = "99";
    const numberBlock = report.sections
      .flatMap((section) => section.blocks)
      .find((block) => block.type === "number_card");
    if (numberBlock === undefined) throw new Error("Missing number block");
    const reservedFact = current.bundle.facts[0];
    if (reservedFact === undefined) throw new Error("Missing fact");
    numberBlock.factId = reservedFact.factId;
    const factPlan = {
      ...current.plan,
      sections: current.plan.sections.map((section) => ({
        ...section,
        reservedFactIds: section.reservedFactIds.filter((factId) => factId !== reservedFact.factId),
      })),
    };
    const timeline = report.sections
      .flatMap((section) => section.blocks)
      .find((block) => block.type === "timeline");
    if (timeline === undefined) throw new Error("Missing timeline");
    const firstTimelineItem = timeline.items[0];
    if (firstTimelineItem === undefined) throw new Error("Missing timeline item");
    firstTimelineItem.claimId = parseReportClaimId("claim.unknown-timeline-claim");
    const comparison = report.sections
      .flatMap((section) => section.blocks)
      .find((block) => block.type === "comparison");
    if (comparison === undefined) throw new Error("Missing comparison");
    comparison.rightFactId = comparison.leftFactId;
    expect(checkNumeric(report, current.plan).diagnostics).toContainEqual(
      expect.objectContaining({ code: "REPORT_NUMBER_NOT_ALLOWED" }),
    );
    expect(checkFactLinkage(report, current.bundle, factPlan).diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "REPORT_CLAIM_FACT_LINK_MISMATCH" }),
        expect.objectContaining({ code: "REPORT_BLOCK_FACT_NOT_RESERVED" }),
        expect.objectContaining({ code: "REPORT_TIMELINE_CLAIM_UNKNOWN" }),
      ]),
    );
    expect(checkRuleSource(report, current.evidence, current.plan).diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "REPORT_CLAIM_RULE_SOURCE_MISMATCH" }),
        expect.objectContaining({ code: "REPORT_RULE_SOURCE_UNRESOLVED" }),
      ]),
    );
    const noRuleReport = structuredClone(report) as unknown as MutableReport;
    const noRuleClaim = noRuleReport.claims[0];
    if (noRuleClaim === undefined) throw new Error("Missing no-rule claim");
    noRuleClaim.claimId = current.report.claims[0]?.claimId ?? noRuleClaim.claimId;
    noRuleClaim.ruleIds = [];
    expect(
      checkRuleSource(noRuleReport, current.evidence, current.plan).diagnostics,
    ).toContainEqual(expect.objectContaining({ code: "REPORT_CLAIM_RULE_SOURCE_MISMATCH" }));
    const profileDrift = structuredClone(current.report) as unknown as MutableReport;
    const profileClaim = profileDrift.claims[0];
    if (profileClaim === undefined) throw new Error("Missing profile claim");
    profileClaim.factIds = [parseFactId("unknown.profile.fact")];
    expect(
      checkSchoolBoundary(profileDrift, current.bundle, current.plan).diagnostics,
    ).toContainEqual(expect.objectContaining({ code: "REPORT_PROFILE_BOUNDARY_MISMATCH" }));
    expect(checkSchoolBoundary(report, current.bundle, current.plan).diagnostics).toContainEqual(
      expect.objectContaining({ code: "REPORT_COMPARISON_PROFILE_BLENDED" }),
    );
  });

  it("covers corpus and planner failure outcomes", () => {
    const current = fixture();
    expect(() =>
      validateReportPlan({ ...current.plan, policy: undefined }, undefined),
    ).not.toThrow();
    const altered = current.plan.sections.map((section) => ({ ...section, claimIds: [] }));
    expect(validateReportPlan({ ...current.plan, sections: altered }).valid).toBe(false);
    expect(() =>
      planReport(current.bundle, current.evidence, { minimumIndependentProfileFamilies: 99 }),
    ).toThrow("INSUFFICIENT_INDEPENDENT_PROFILE_FAMILIES");
  });

  it("rejects a corpus with an incomplete locale distribution", () => {
    const changed = (corpus as readonly EvaluationSubject[]).map((subject) =>
      subject.locale === "en-IN"
        ? {
            ...subject,
            locale: "hi-IN",
            subjectId: `SYN-HI-${String(101 + Number(subject.subjectId.slice(-3))).padStart(3, "0")}`,
          }
        : subject,
    );
    expect(() => parseEvaluationCorpus(changed)).toThrow("EVALUATION_LOCALE_DISTRIBUTION");
  });

  it("keeps Checkpoint 4 CLI usage and invalid-input exits stable", async () => {
    const writes = new Map<string, string>();
    const io: ReportCliIo = {
      read: async (path) => (path === "release.json" ? "{}" : "{}"),
      stderr: () => undefined,
      stdout: () => undefined,
      write: async (path, text) => {
        writes.set(path, text);
      },
    };
    expect(
      await runReportCli(["generate", "--release", "release.json", "--format", "yaml"], io),
    ).toBe(2);
    expect(
      await runReportCli(
        [
          "generate",
          "--release",
          "release.json",
          "--output",
          "same",
          "--verification-output",
          "same",
        ],
        io,
      ),
    ).toBe(2);
    expect(await runReportCli(["generate", "--release", "release.json"], io)).toBe(3);
    expect(
      await runReportCli(
        [
          "synthetic-plan",
          "--release",
          "release.json",
          "--fixture",
          "G-W-LP-001",
          "--locale",
          "en",
          "--as-of",
          "2026-08-31",
        ],
        io,
      ),
    ).toBe(3);
    expect(writes).toHaveLength(0);
  });
});
