import { describe, expect, it } from "vitest";
import { writeDeterministicReport } from "./deterministic-writer";
import { parseReportId } from "./ids";
import { planReport } from "./planner";
import { renderStructuredReportHtml } from "./report-renderer";
import { stableStructuredReport } from "./report-serialization";
import { buildCheckpointFourTestFixture, buildIntegrationFixture } from "./test-support";

describe("deterministic report writer and renderer", () => {
  it("realizes every planned claim and all semantic blocks with immutable byte stability", () => {
    const fixture = buildCheckpointFourTestFixture();
    const first = writeDeterministicReport({
      bundle: fixture.bundle,
      displayName: "Synthetic Subject",
      evidence: fixture.evidence,
      generatedAt: "2026-09-01T00:00:00.000Z",
      locale: "en-IN",
      plan: fixture.plan,
      reportId: parseReportId("00000000-0000-4000-8000-000000000004"),
      reportVersion: 1,
    });
    const second = writeDeterministicReport({
      bundle: structuredClone(fixture.bundle),
      displayName: "Synthetic Subject",
      evidence: structuredClone(fixture.evidence),
      generatedAt: "2026-09-01T00:00:00.000Z",
      locale: "en-IN",
      plan: structuredClone(fixture.plan),
      reportId: parseReportId("00000000-0000-4000-8000-000000000004"),
      reportVersion: 1,
    });

    expect(stableStructuredReport(second)).toBe(stableStructuredReport(first));
    expect(first.claims.map((claim) => claim.claimId).sort()).toEqual(
      fixture.plan.claims.map((claim) => claim.claimId).sort(),
    );
    expect(
      new Set(first.sections.flatMap((section) => section.blocks.map((block) => block.type))),
    ).toEqual(new Set(["prose", "number_card", "comparison", "lo_shu", "timeline", "source_note"]));
    expect(first.versions).toMatchObject({
      doctrineHash: fixture.evidence.reproducibility.doctrineReleaseHash,
      engine: fixture.bundle.engineVersion,
      writer: "deterministic-template.en-IN.1.0.0",
      writerPolicy: "deterministic-safe-reflection.1.0.0",
      planner: fixture.plan.plannerVersion,
    });
    expect(Object.isFrozen(first.sections[0]?.blocks)).toBe(true);
  });

  it("fails closed on incomplete plans, evidence identity drift, and unavailable locales", () => {
    const small = buildIntegrationFixture();
    const smallPlan = planReport(small.bundle, small.evidence, {
      maxRootWordShare: 1,
      maxTimingWordShare: 1,
      minimumIndependentProfileFamilies: 0,
    });
    expect(() =>
      writeDeterministicReport({
        bundle: small.bundle,
        displayName: "Synthetic",
        evidence: small.evidence,
        generatedAt: "2026-09-01T00:00:00.000Z",
        locale: "en-IN",
        plan: smallPlan,
        reportId: parseReportId("00000000-0000-4000-8000-000000000004"),
        reportVersion: 1,
      }),
    ).toThrow("WRITER_CLAIM_CARDINALITY");

    const fixture = buildCheckpointFourTestFixture();
    expect(() =>
      writeDeterministicReport({
        bundle: fixture.bundle,
        displayName: "Synthetic",
        evidence: { ...fixture.evidence, resolutionHash: `sha256:${"0".repeat(64)}` },
        generatedAt: "2026-09-01T00:00:00.000Z",
        locale: "en-IN",
        plan: fixture.plan,
        reportId: parseReportId("00000000-0000-4000-8000-000000000004"),
        reportVersion: 1,
      }),
    ).toThrow("WRITER_REPRODUCIBILITY_MISMATCH");
    expect(() =>
      writeDeterministicReport({
        bundle: fixture.bundle,
        displayName: "Synthetic",
        evidence: fixture.evidence,
        generatedAt: "2026-09-01T00:00:00.000Z",
        locale: "hi-IN",
        plan: fixture.plan,
        reportId: parseReportId("00000000-0000-4000-8000-000000000004"),
        reportVersion: 1,
      }),
    ).toThrow("WRITER_LOCALE_MISMATCH");
  });

  it("escapes private display data and renders semantic navigation, grids, and source notes", () => {
    const fixture = buildCheckpointFourTestFixture();
    const report = writeDeterministicReport({
      bundle: fixture.bundle,
      displayName: "<script>alert('x')</script>",
      evidence: fixture.evidence,
      generatedAt: "2026-09-01T00:00:00.000Z",
      locale: "en-IN",
      plan: fixture.plan,
      reportId: parseReportId("00000000-0000-4000-8000-000000000004"),
      reportVersion: 1,
    });
    const html = renderStructuredReportHtml(report, fixture.bundle);

    expect(html).toContain('<nav class="report-nav" aria-label="Report sections">');
    expect(html).toContain("Lo Shu digit occurrence table");
    expect(html).toContain("source-note");
    expect(html).toContain('<a class="skip-link" href="#report-content">');
    const targets = [...html.matchAll(/href="#([^"]+)"/gu)].map((match) => match[1]);
    expect(targets.length).toBeGreaterThan(18);
    for (const target of targets) {
      expect(html).toContain(`id="${target}"`);
    }
    expect(html).toContain("&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert('x')</script>");

    const sectionText = (sectionId: string) =>
      report.sections
        .find((section) => section.sectionId === sectionId)
        ?.blocks.flatMap((block) => {
          switch (block.type) {
            case "prose":
              return block.paragraphs;
            case "timeline":
              return block.items.map((item) => item.label);
            case "number_card":
            case "lo_shu":
              return [block.caption];
            case "comparison":
            case "source_note":
              return [block.body];
          }
          return [];
        })
        .join(" ") ?? "";
    const reportText = report.sections
      .flatMap((section) =>
        section.blocks.flatMap((block) => {
          switch (block.type) {
            case "prose":
              return block.paragraphs;
            case "timeline":
              return block.items.map((item) => item.label);
            case "number_card":
            case "lo_shu":
              return [block.caption];
            case "comparison":
            case "source_note":
              return [block.body];
          }
          return [];
        }),
      )
      .join(" ");
    expect(reportText).not.toContain("while this");
    expect(sectionText("section.actions")).toContain("reversible");
    expect(sectionText("section.lo_shu_raw_grid")).toContain("cell");
    expect(sectionText("section.work_money")).toContain("employment");
  });
});
