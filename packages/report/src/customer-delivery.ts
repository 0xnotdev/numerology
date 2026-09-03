import {
  type CalculatedFact,
  canonicalHash,
  type FactId,
  parseCalculationBundle,
} from "@numerology/engine";
import { deepFreeze } from "@numerology/shared";
import { z } from "zod";
import { READER_STYLES } from "./report-renderer";
import {
  parseStructuredReport,
  type ReportBlock,
  type StructuredReport,
} from "./structured-report";
import { parseReportVerificationRecord, type ReportVerificationRecord } from "./verification/types";

const customerDisclaimer =
  "Numerology is a cultural tradition for structured self-reflection. It is not scientifically validated prediction, diagnosis, probability, or professional advice.";

const customerBlockSchema = z.discriminatedUnion("type", [
  z.strictObject({ paragraphs: z.array(z.string().min(1)).min(1), type: z.literal("prose") }),
  z.strictObject({
    caption: z.string().min(1),
    type: z.literal("number_card"),
    value: z.string().min(1),
  }),
  z.strictObject({
    body: z.string().min(1),
    left: z.strictObject({ label: z.string().min(1), value: z.string().min(1) }),
    right: z.strictObject({ label: z.string().min(1), value: z.string().min(1) }),
    type: z.literal("comparison"),
  }),
  z.strictObject({
    caption: z.string().min(1),
    grid: z
      .array(
        z.strictObject({
          count: z.number().int().nonnegative(),
          digit: z.number().int().min(1).max(9),
        }),
      )
      .length(9),
    type: z.literal("lo_shu"),
  }),
  z.strictObject({
    items: z.array(z.strictObject({ label: z.string().min(1), value: z.string().min(1) })).min(1),
    type: z.literal("timeline"),
  }),
  z.strictObject({ body: z.string().min(1), type: z.literal("source_note") }),
]);

const customerSectionSchema = z.strictObject({
  blocks: z.array(customerBlockSchema).min(1),
  dek: z.string().min(1).optional(),
  order: z.number().int().positive(),
  title: z.string().min(1),
});

const customerPracticeSchema = z.discriminatedUnion("availability", [
  z.strictObject({
    availability: z.literal("available"),
    instruction: z.string().min(1),
    label: z.string().min(1),
    noPromisedResult: z.literal(true),
    optional: z.literal(true),
  }),
  z.strictObject({
    availability: z.literal("unavailable"),
    label: z.string().min(1),
    message: z.string().min(1),
    noPromisedResult: z.literal(true),
    optional: z.literal(true),
  }),
]);

export const customerDeliveryProjectionSchema = z.strictObject({
  disclaimer: z.string().min(1),
  displayName: z.string().min(1),
  locale: z.enum(["en-IN", "hi-IN", "or-IN"]),
  practicalAlternatives: z.array(customerPracticeSchema).min(1),
  sections: z.array(customerSectionSchema).min(1),
  traditionalPractices: z.array(customerPracticeSchema).min(1),
  title: z.string().min(1),
});

export type CustomerDeliveryBlock = z.output<typeof customerBlockSchema>;
export type CustomerDeliverySection = z.output<typeof customerSectionSchema>;
export type CustomerDeliveryProjection = z.output<typeof customerDeliveryProjectionSchema>;
export type CustomerTraditionalPractice =
  CustomerDeliveryProjection["traditionalPractices"][number];
export type CustomerPracticalAlternative =
  CustomerDeliveryProjection["practicalAlternatives"][number];

export function parseCustomerDeliveryProjection(input: unknown): CustomerDeliveryProjection {
  return deepFreeze(customerDeliveryProjectionSchema.parse(input));
}

function parseBoundVerification(
  input: unknown,
  report: StructuredReport,
  bundleHash: string,
): ReportVerificationRecord {
  try {
    const verification = parseReportVerificationRecord(input);
    if (
      !verification.valid ||
      verification.reportHash === null ||
      verification.reportHash !== report.reportHash ||
      verification.calculationBundleHash !== bundleHash
    ) {
      throw new Error("verification binding mismatch");
    }
    return verification;
  } catch {
    throw new RangeError("CUSTOMER_DELIVERY_VERIFICATION_INVALID");
  }
}

function factValue(fact: CalculatedFact | undefined): string {
  return fact === undefined || fact.displayTokens.length === 0
    ? "Not displayed"
    : fact.displayTokens.join(" · ");
}

const FORBIDDEN_CUSTOMER_COPY =
  /fact\s*identifier|\bfacts?\b|\brules?\b|\bsources?\b|\btrace\w*\b|suppression|version(?:ed)?|audit\s+trail|active\s+and\s+approved|verification|confidence|ranking|\bhash(?:es)?\b|provenance|\bgates?\b|\bdoctrine\b/iu;

/** Customer prose is authored safe; unexpected reviewer vocabulary fails closed. */
function customerCopy(value: string): string {
  if (FORBIDDEN_CUSTOMER_COPY.test(value)) {
    throw new RangeError("CUSTOMER_DELIVERY_COPY_NOT_SAFE");
  }
  return value;
}

const customerMethodNote =
  "This note explains the numerology traditions and calculation choices for this reading while keeping every prompt optional and each tradition distinct.";

function projectBlock(
  block: ReportBlock,
  facts: ReadonlyMap<FactId, CalculatedFact>,
): CustomerDeliveryBlock {
  switch (block.type) {
    case "prose":
      return { paragraphs: block.paragraphs.map(customerCopy), type: "prose" };
    case "number_card":
      return {
        caption: customerCopy(block.caption),
        type: "number_card",
        value: factValue(facts.get(block.factId)),
      };
    case "comparison":
      return {
        body: customerCopy(block.body),
        left: { label: "First method", value: factValue(facts.get(block.leftFactId)) },
        right: { label: "Second method", value: factValue(facts.get(block.rightFactId)) },
        type: "comparison",
      };
    case "lo_shu": {
      const order = [4, 9, 2, 3, 5, 7, 8, 1, 6] as const;
      const fact = facts.get(block.gridFactId);
      return {
        caption: customerCopy(block.caption),
        grid: order.map((digit) => ({ count: fact?.occurrences?.[String(digit)] ?? 0, digit })),
        type: "lo_shu",
      };
    }
    case "timeline":
      return {
        items: block.items.map((item) => ({
          label: customerCopy(item.label),
          value: factValue(facts.get(item.factId)),
        })),
        type: "timeline",
      };
    case "source_note":
      return { body: customerMethodNote, type: "source_note" };
  }
}

function actionParagraphs(report: StructuredReport) {
  const section = report.sections.find((candidate) => candidate.templateKey === "actions");
  const prose = section?.blocks.find((block) => block.type === "prose");
  if (prose?.type !== "prose") return [];
  return prose.paragraphs.slice(1).flatMap((paragraph) => {
    const evidence = prose.sentenceProvenance.find(
      (item) => item.kind === "action" && item.text === paragraph && item.sourceRefs.length > 0,
    );
    return evidence === undefined ? [] : [{ evidence, instruction: paragraph }];
  });
}

function projectTraditionalPractices(report: StructuredReport): CustomerTraditionalPractice[] {
  const approved = actionParagraphs(report).filter(
    ({ evidence }) =>
      evidence.actionClassification === "traditional_practice" &&
      evidence.actionRuleTypes?.includes("remedy") === true,
  );
  if (approved.length === 0) {
    return [
      {
        availability: "unavailable",
        label: "Traditional practice",
        message: "No approved traditional practice is available for this reading.",
        noPromisedResult: true,
        optional: true,
      },
    ];
  }
  return approved.map(({ instruction }) => ({
    availability: "available" as const,
    instruction: customerCopy(instruction),
    label: "Optional traditional practice",
    noPromisedResult: true as const,
    optional: true as const,
  }));
}

function projectPracticalAlternatives(report: StructuredReport): CustomerPracticalAlternative[] {
  const alternatives = actionParagraphs(report).filter(
    ({ evidence }) => evidence.actionClassification === "practical_alternative",
  );
  if (alternatives.length === 0) {
    return [
      {
        availability: "unavailable",
        label: "Practical alternative",
        message: "No supported practical alternative is available for this reading.",
        noPromisedResult: true,
        optional: true,
      },
    ];
  }
  return alternatives.map(({ instruction }) => ({
    availability: "available" as const,
    instruction: customerCopy(instruction),
    label: "Optional practical alternative",
    noPromisedResult: true as const,
    optional: true as const,
  }));
}

/**
 * Removes durable identifiers, provenance, ranking, confidence, and verifier records at the
 * customer boundary while retaining all readable interpretation, charts, and remedy prompts.
 */
export function projectCustomerDelivery(
  reportInput: unknown,
  bundleInput: unknown,
  verificationInput: unknown,
): CustomerDeliveryProjection {
  const report = parseStructuredReport(reportInput);
  const bundle = parseCalculationBundle(bundleInput);
  parseBoundVerification(verificationInput, report, canonicalHash(bundle));
  const facts = new Map(bundle.facts.map((fact) => [fact.factId, fact]));
  const projection = {
    disclaimer: customerCopy(customerDisclaimer),
    displayName: customerCopy(report.displayName),
    locale: report.locale,
    practicalAlternatives: projectPracticalAlternatives(report),
    sections: report.sections.map((section) => ({
      blocks: section.blocks.map((block) => projectBlock(block, facts)),
      ...(section.dek === undefined ? {} : { dek: customerCopy(section.dek) }),
      order: section.order,
      title: customerCopy(section.title),
    })),
    traditionalPractices: projectTraditionalPractices(report),
    title: customerCopy(report.title),
  };
  return deepFreeze(customerDeliveryProjectionSchema.parse(projection));
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderBlock(block: CustomerDeliveryBlock): string {
  switch (block.type) {
    case "prose":
      return `<div class="prose-block">${block.paragraphs.map((text) => `<p>${escapeHtml(text)}</p>`).join("")}</div>`;
    case "number_card":
      return `<figure class="number-card"><div class="number-value">${escapeHtml(block.value)}</div><figcaption>${escapeHtml(block.caption)}</figcaption></figure>`;
    case "comparison":
      return `<figure class="comparison-block"><div><strong>${escapeHtml(block.left.label)}</strong><span>${escapeHtml(block.left.value)}</span></div><div><strong>${escapeHtml(block.right.label)}</strong><span>${escapeHtml(block.right.value)}</span></div><figcaption>${escapeHtml(block.body)}</figcaption></figure>`;
    case "lo_shu":
      return `<figure class="grid-block"><table class="lo-shu-table"><caption>Lo Shu digit occurrence table</caption><tbody>${[
        0, 3, 6,
      ]
        .map(
          (start) =>
            `<tr>${block.grid
              .slice(start, start + 3)
              .map(
                (cell) =>
                  `<td><span class="grid-digit">${cell.digit}</span><span class="grid-count">Count ${cell.count}</span></td>`,
              )
              .join("")}</tr>`,
        )
        .join("")}</tbody></table><figcaption>${escapeHtml(block.caption)}</figcaption></figure>`;
    case "timeline":
      return `<ol class="timeline">${block.items.map((item) => `<li><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong></li>`).join("")}</ol>`;
    case "source_note":
      return `<aside class="source-note"><p>${escapeHtml(block.body)}</p></aside>`;
  }
}

function renderTraditionalPractices(
  practices: CustomerDeliveryProjection["traditionalPractices"],
): string {
  return `<section class="traditional-practices" aria-labelledby="traditional-practices-title"><h2 id="traditional-practices-title">Optional traditional practices</h2>${practices
    .map((practice) =>
      practice.availability === "available"
        ? `<article><h3>${escapeHtml(practice.label)}</h3><p>${escapeHtml(practice.instruction)}</p><p class="practice-note">Optional, low-risk, and reversible; no result is promised.</p></article>`
        : `<article><h3>${escapeHtml(practice.label)}</h3><p>${escapeHtml(practice.message)}</p></article>`,
    )
    .join("")}</section>`;
}

function renderPracticalAlternatives(
  practices: CustomerDeliveryProjection["practicalAlternatives"],
): string {
  return `<section class="practical-alternatives" aria-labelledby="practical-alternatives-title"><h2 id="practical-alternatives-title">Practical alternatives</h2>${practices
    .map((practice) =>
      practice.availability === "available"
        ? `<article><h3>${escapeHtml(practice.label)}</h3><p>${escapeHtml(practice.instruction)}</p><p class="practice-note">Optional, low-risk, and reversible; no result is promised.</p></article>`
        : `<article><h3>${escapeHtml(practice.label)}</h3><p>${escapeHtml(practice.message)}</p></article>`,
    )
    .join("")}</section>`;
}

/** Renders only the customer projection; it cannot access or print verifier metadata. */
export function renderCustomerDeliveryHtml(projectionInput: unknown): string {
  const report = parseCustomerDeliveryProjection(projectionInput);
  const navigation = report.sections
    .map(
      (section) =>
        `<li><a href="#customer-section-${section.order}">${escapeHtml(section.title)}</a></li>`,
    )
    .join("");
  const sections = report.sections
    .map(
      (section) =>
        `<section class="report-section" id="customer-section-${section.order}" aria-labelledby="customer-section-${section.order}-title"><p class="eyebrow">Section ${section.order}</p><h2 id="customer-section-${section.order}-title">${escapeHtml(section.title)}</h2>${section.dek === undefined ? "" : `<p class="dek">${escapeHtml(section.dek)}</p>`}${section.blocks.map(renderBlock).join("")}</section>`,
    )
    .join("");
  return `<!doctype html><html lang="${escapeHtml(report.locale)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escapeHtml(report.title)}</title><style>${READER_STYLES}</style></head><body><a class="skip-link" href="#report-content">Skip to report</a><main class="report-shell"><nav class="report-nav" aria-label="Report sections"><p class="eyebrow">Reading map</p><ol>${navigation}</ol></nav><article id="report-content"><header class="report-cover"><p class="eyebrow">Personal reflection</p><h1>${escapeHtml(report.title)}</h1><p>${escapeHtml(report.displayName)}</p><p class="dek">${escapeHtml(report.disclaimer)}</p></header>${sections}${renderPracticalAlternatives(report.practicalAlternatives)}${renderTraditionalPractices(report.traditionalPractices)}</article></main></body></html>`;
}
