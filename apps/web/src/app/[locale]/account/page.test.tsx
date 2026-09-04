import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AccountPage, { metadata as accountMetadata } from "./page";
import ReportPage, { metadata as reportMetadata } from "../reports/[reportId]/page";

const reportId = "00000000-0000-4000-8000-000000000041";

describe("private customer routes", () => {
  it("renders the account shell without embedding account data", async () => {
    const page = await AccountPage({ params: Promise.resolve({ locale: "en-IN" }) });
    const html = renderToStaticMarkup(page);

    expect(html).toContain("Loading your private reports");
    expect(html).not.toMatch(/principalId|email|entitlement/iu);
  });

  it("renders the private report shell without embedding report data", async () => {
    const page = await ReportPage({
      params: Promise.resolve({ locale: "hi-IN", reportId }),
    });
    const html = renderToStaticMarkup(page);

    expect(html).toContain("Loading your private report");
    expect(html).not.toMatch(/confidence|ranking|verification|reportHash/iu);
  });

  it("marks every private page non-indexable and non-cacheable", () => {
    const robots = { follow: false, index: false, nocache: true };
    expect(accountMetadata.robots).toEqual(robots);
    expect(reportMetadata.robots).toEqual(robots);
  });
});
