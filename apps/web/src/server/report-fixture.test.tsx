import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SyntheticReportReader } from "../app/fixture/[id]/report-reader";
import { isReportFixtureEnvironment, loadSyntheticReportFixture } from "./report-fixture";

const FIXTURE_ID = "00000000-0000-4000-8000-000000000004";

describe("synthetic customer report reader", () => {
  it("allows only non-production fixture environments", () => {
    expect(isReportFixtureEnvironment("development")).toBe(true);
    expect(isReportFixtureEnvironment("test")).toBe(true);
    expect(isReportFixtureEnvironment("production")).toBe(false);
  });

  it("resolves only the branded committed fixture identifier", () => {
    expect(loadSyntheticReportFixture(FIXTURE_ID)?.report.reportId).toBe(FIXTURE_ID);
    expect(loadSyntheticReportFixture("00000000-0000-4000-8000-000000000005")).toBeNull();
    expect(loadSyntheticReportFixture("../../customer-report")).toBeNull();
  });

  it("renders an accessible semantic reader with valid in-page links and no raw intake PII", () => {
    const fixture = loadSyntheticReportFixture(FIXTURE_ID);
    if (fixture === null) {
      throw new Error("Missing committed report fixture.");
    }
    const html = renderToStaticMarkup(<SyntheticReportReader fixture={fixture} />);

    expect(html).toContain('<main class="readerShell">');
    expect(html).toContain('<nav class="readerNav" aria-label="Report sections">');
    expect(html).toContain('<article id="report-content">');
    expect(html).toContain("Lo Shu digit occurrence table");
    expect(html).toContain("readerNumberCard");
    expect(html).toContain("readerComparison");
    expect(html).toContain("readerTimeline");
    expect(html).toContain("readerSourceNote");
    expect(html).toContain("Methodology appendix");
    expect(html).toContain("Every prompt is optional, reversible, and not professional advice.");
    expect(html).not.toContain("Verified by");
    expect(html).not.toContain("reportHash");
    expect(html).not.toContain("reportId");
    expect(html).not.toContain("sourceRefs");
    expect(html.match(/class="readerSection"/gu)).toHaveLength(18);

    const targets = [...html.matchAll(/href="#([^"]+)"/gu)].map((match) => match[1]);
    expect(targets.length).toBeGreaterThan(18);
    for (const target of targets) {
      expect(html).toContain(`id="${target}"`);
    }
    expect(html).not.toContain("THOMAS CRUISE MAPOTHER");
    expect(html).not.toContain("1990-08-12");
    expect(html).not.toContain("onClick=");
  });
});
