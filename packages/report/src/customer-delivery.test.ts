import { describe, expect, it } from "vitest";
import { projectCustomerDelivery, renderCustomerDeliveryHtml } from "./customer-delivery";
import { buildCheckpointFourTestFixture } from "./test-support";

type Mutable<T> = T extends string | number | boolean | bigint | null | undefined
  ? T
  : T extends ReadonlyArray<infer U>
    ? Mutable<U>[]
    : { -readonly [K in keyof T]: Mutable<T[K]> };

describe("customer delivery projection", () => {
  it("projects every reader block without durable verifier metadata", () => {
    const fixture = buildCheckpointFourTestFixture();
    const projection = projectCustomerDelivery(
      fixture.report,
      fixture.bundle,
      fixture.verification,
    );
    const json = JSON.stringify(projection);

    expect(projection.sections).toHaveLength(18);
    expect(
      new Set(projection.sections.flatMap((section) => section.blocks.map((block) => block.type))),
    ).toEqual(new Set(["prose", "number_card", "comparison", "lo_shu", "timeline", "source_note"]));
    expect(projection.traditionalPractices.length).toBeGreaterThan(0);
    expect(projection.traditionalPractices.every((practice) => practice.optional)).toBe(true);
    expect(projection.traditionalPractices.every((practice) => practice.noPromisedResult)).toBe(
      true,
    );
    expect(projection.traditionalPractices).toEqual([
      {
        availability: "unavailable",
        label: "Traditional practice",
        message: "No approved traditional practice is available for this reading.",
        noPromisedResult: true,
        optional: true,
      },
    ]);
    expect(
      projection.practicalAlternatives.some((practice) => practice.availability === "available"),
    ).toBe(true);
    const internalKeys = [...json.matchAll(/"([^"]+)":/gu)].map((match) => match[1]);
    for (const key of [
      "confidence",
      "rank",
      "provenance",
      "verification",
      "sourceRefs",
      "factIds",
      "ruleIds",
      "traceIds",
      "reportHash",
      "reportId",
      "versions",
    ]) {
      expect(internalKeys).not.toContain(key);
    }
    expect(json).toContain("Numerology is a cultural tradition");
    expect(json).toContain("reversible");
    const customerText = [...json.matchAll(/"(?:[^"\\]|\\.)*"/gu)]
      .map((match) => match[0])
      .join(" ");
    expect(customerText).not.toMatch(
      /fact\s*identifier|\bfacts?\b|\brules?\b|\bsources?\b|\btrace\w*\b|suppression|version(?:ed)?|audit\s+trail|active\s+and\s+approved|verification|confidence|ranking|\bhash(?:es)?\b|provenance|\bgates?\b/iu,
    );
  });

  it("renders a customer reader with safe anchors and no internal metadata", () => {
    const fixture = buildCheckpointFourTestFixture();
    const html = renderCustomerDeliveryHtml(
      projectCustomerDelivery(fixture.report, fixture.bundle, fixture.verification),
    );

    expect(html).toContain('<main class="report-shell">');
    expect(html).toContain("Lo Shu digit occurrence table");
    expect(html).toContain("Methodology appendix");
    expect(html).toContain("Optional traditional practices");
    expect(html).toContain("Practical alternatives");
    expect(html).toContain("Write a brief reflection");
    expect(html).not.toContain("Verified by");
    expect(html).not.toMatch(
      /reportHash|reportId|sourceRefs|factIds|ruleIds|traceIds|Verified by/iu,
    );
    const targets = [...html.matchAll(/href="#([^"]+)"/gu)].map((match) => match[1]);
    for (const target of targets) {
      expect(html).toContain(`id="${target}"`);
    }
  });

  it("reports an explicit unavailable practice state when no source-backed practice exists", () => {
    const fixture = buildCheckpointFourTestFixture();
    const report = {
      ...fixture.report,
      sections: fixture.report.sections.map((section) =>
        section.templateKey !== "actions"
          ? section
          : {
              ...section,
              blocks: section.blocks.map((block) =>
                block.type !== "prose"
                  ? block
                  : {
                      ...block,
                      sentenceProvenance: block.sentenceProvenance.map((item) => ({
                        ...item,
                        kind: "editorial" as const,
                        sourceRefs: [],
                      })),
                    },
              ),
            },
      ),
    };
    const projection = projectCustomerDelivery(report, fixture.bundle, fixture.verification);
    expect(projection.traditionalPractices).toEqual([
      {
        availability: "unavailable",
        label: "Traditional practice",
        message: "No approved traditional practice is available for this reading.",
        noPromisedResult: true,
        optional: true,
      },
    ]);
  });

  it("projects only explicitly remedy-classified action evidence as a traditional practice", () => {
    const fixture = buildCheckpointFourTestFixture();
    const report = {
      ...fixture.report,
      sections: fixture.report.sections.map((section) =>
        section.templateKey !== "actions"
          ? section
          : {
              ...section,
              blocks: section.blocks.map((block) =>
                block.type !== "prose"
                  ? block
                  : {
                      ...block,
                      sentenceProvenance: block.sentenceProvenance.map((item, index) =>
                        index === 1
                          ? {
                              ...item,
                              actionClassification: "traditional_practice" as const,
                              actionRuleTypes: ["remedy" as const],
                              kind: "action" as const,
                            }
                          : item,
                      ),
                    },
              ),
            },
      ),
    };
    const projection = projectCustomerDelivery(report, fixture.bundle, fixture.verification);
    expect(projection.traditionalPractices).toEqual([
      {
        availability: "available",
        instruction:
          "Write a brief reflection, then compare it with an ordinary practical observation.",
        label: "Optional traditional practice",
        noPromisedResult: true,
        optional: true,
      },
    ]);
    expect(
      projection.practicalAlternatives.every((practice) => practice.availability === "available"),
    ).toBe(true);
    expect(renderCustomerDeliveryHtml(projection)).toContain(
      "Optional, low-risk, and reversible; no result is promised.",
    );
  });

  it("renders explicit unavailable states when an actions section has no prose", () => {
    const fixture = buildCheckpointFourTestFixture();
    const methodBlock = fixture.report.sections
      .flatMap((section) => section.blocks)
      .find((block) => block.type === "source_note");
    if (methodBlock === undefined) throw new Error("Missing method block");
    const report = {
      ...fixture.report,
      sections: fixture.report.sections.map((section) =>
        section.templateKey === "actions" ? { ...section, blocks: [methodBlock] } : section,
      ),
    };
    const projection = projectCustomerDelivery(report, fixture.bundle, fixture.verification);
    const html = renderCustomerDeliveryHtml(projection);

    expect(projection.practicalAlternatives).toEqual([
      expect.objectContaining({ availability: "unavailable" }),
    ]);
    expect(projection.traditionalPractices).toEqual([
      expect.objectContaining({ availability: "unavailable" }),
    ]);
    expect(html).toContain("No supported practical alternative is available for this reading.");
    expect(html).toContain("No approved traditional practice is available for this reading.");
  });

  it("uses explicit empty display states when report blocks reference unavailable facts", () => {
    const fixture = buildCheckpointFourTestFixture();
    const report = structuredClone(fixture.report) as unknown as Mutable<typeof fixture.report>;
    const blocks = report.sections.flatMap((section) => section.blocks);
    const numberCard = blocks.find((block) => block.type === "number_card");
    const loShu = blocks.find((block) => block.type === "lo_shu");
    if (numberCard?.type !== "number_card" || loShu?.type !== "lo_shu") {
      throw new Error("Missing customer display blocks");
    }
    numberCard.factId = "unknown.number-card.fact" as typeof numberCard.factId;
    loShu.gridFactId = "unknown.lo-shu.fact" as typeof loShu.gridFactId;

    const projection = projectCustomerDelivery(report, fixture.bundle, fixture.verification);
    const projectedCard = projection.sections
      .flatMap((section) => section.blocks)
      .find((block) => block.type === "number_card");
    const projectedGrid = projection.sections
      .flatMap((section) => section.blocks)
      .find((block) => block.type === "lo_shu");
    expect(projectedCard).toEqual(expect.objectContaining({ value: "Not displayed" }));
    expect(projectedGrid).toEqual(
      expect.objectContaining({ grid: expect.arrayContaining([{ count: 0, digit: 9 }]) }),
    );
  });

  it("omits absent section dek copy and rejects internal reviewer vocabulary", () => {
    const fixture = buildCheckpointFourTestFixture();
    const report = structuredClone(fixture.report) as unknown as Mutable<typeof fixture.report>;
    const firstSection = report.sections[0];
    if (firstSection === undefined) throw new Error("Missing first section");
    delete firstSection.dek;
    const projection = projectCustomerDelivery(report, fixture.bundle, fixture.verification);
    expect(projection.sections[0]).not.toHaveProperty("dek");

    expect(() =>
      projectCustomerDelivery(
        { ...fixture.report, title: "Internal verification result" },
        fixture.bundle,
        fixture.verification,
      ),
    ).toThrow("CUSTOMER_DELIVERY_COPY_NOT_SAFE");
  });

  it("fails closed when verification is missing, invalid, or bound to another report", () => {
    const fixture = buildCheckpointFourTestFixture();
    expect(() => projectCustomerDelivery(fixture.report, fixture.bundle, undefined)).toThrow(
      "CUSTOMER_DELIVERY_VERIFICATION_INVALID",
    );
    expect(() =>
      projectCustomerDelivery(fixture.report, fixture.bundle, {
        ...fixture.verification,
        reportHash: `sha256:${"0".repeat(64)}`,
      }),
    ).toThrow("CUSTOMER_DELIVERY_VERIFICATION_INVALID");
    expect(() =>
      projectCustomerDelivery(fixture.report, fixture.bundle, {
        ...fixture.verification,
        valid: false,
      }),
    ).toThrow("CUSTOMER_DELIVERY_VERIFICATION_INVALID");
  });
});
