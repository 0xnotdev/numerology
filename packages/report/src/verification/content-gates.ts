import { stableStringify } from "@numerology/engine";
import type { ReportPlan } from "../types";
import type { StructuredReport } from "../structured-report";
import { DETERMINISTIC_LOCALE_PACK_VERSION, DETERMINISTIC_WRITER_VERSION } from "../writer-locale";
import {
  REPORT_RENDERER_VERSION,
  REPORT_SAFETY_POLICY_VERSION,
  REPORT_VERIFIER_VERSION,
} from "../report-versions";
import { diagnostic, type GateCheck } from "./diagnostics";
import { normalizedWords, reportTextSpans, shingleSimilarity } from "./text";
import { TEMPLATE_BY_SECTION } from "../writer-sections";

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function checkCompleteness(report: StructuredReport, plan: ReportPlan): GateCheck {
  const diagnostics = [];
  let checkedCount = 0;
  const reportClaimIds = report.claims.map((claim) => claim.claimId).sort();
  const planClaimIds = plan.claims.map((claim) => claim.claimId).sort();
  checkedCount += planClaimIds.length;
  if (!sameStrings(reportClaimIds, planClaimIds)) {
    diagnostics.push(diagnostic("completeness", "REPORT_CLAIM_COVERAGE_INCOMPLETE"));
  }

  if (report.sections.length !== plan.sections.length) {
    diagnostics.push(diagnostic("completeness", "REPORT_SECTION_CARDINALITY"));
  }
  plan.sections.forEach((planned, index) => {
    checkedCount += 1;
    const section = report.sections[index];
    if (
      section === undefined ||
      section.order !== planned.order ||
      section.sectionId !== `section.${planned.key}` ||
      section.templateKey !== TEMPLATE_BY_SECTION[planned.key] ||
      section.title !== planned.label ||
      section.dek === undefined ||
      !sameStrings(section.claimIds, planned.claimIds)
    ) {
      diagnostics.push(
        diagnostic("completeness", "REPORT_SECTION_ORDER_OR_LINK_MISMATCH", {
          ...(section === undefined ? {} : { sectionId: section.sectionId }),
          path: `sections.${index}`,
        }),
      );
    }
  });

  const blockTypes = new Set(
    report.sections.flatMap((section) => section.blocks.map((block) => block.type)),
  );
  checkedCount += 6;
  for (const type of [
    "prose",
    "number_card",
    "comparison",
    "lo_shu",
    "timeline",
    "source_note",
  ] as const) {
    if (!blockTypes.has(type)) {
      diagnostics.push(diagnostic("completeness", "REPORT_BLOCK_TYPE_MISSING", { path: type }));
    }
  }

  const actionSection = report.sections.find((section) => section.sectionId === "section.actions");
  const actionText =
    actionSection?.blocks
      .flatMap((block) => (block.type === "prose" ? block.paragraphs : []))
      .join("\n") ?? "";
  checkedCount += plan.actions.length;
  if (
    plan.actions.length !== 5 ||
    plan.actions.some((action) => action.instructions.some((item) => !actionText.includes(item)))
  ) {
    diagnostics.push(diagnostic("completeness", "REPORT_ACTION_COVERAGE_INCOMPLETE"));
  }

  const appendix = report.sections.find(
    (section) => section.sectionId === "section.methodology_appendix",
  );
  checkedCount += 1;
  if (appendix?.blocks.some((block) => block.type === "source_note") !== true) {
    diagnostics.push(diagnostic("completeness", "REPORT_METHODOLOGY_APPENDIX_INCOMPLETE"));
  }
  if (report.disclaimerKey !== "reflective-not-scientific-v1") {
    diagnostics.push(diagnostic("completeness", "REPORT_DISCLOSURE_MISSING"));
  }

  checkedCount += 13;
  const expectedVersions = {
    doctrine: plan.reproducibility.doctrineReleaseId,
    doctrineHash: plan.reproducibility.doctrineReleaseHash,
    engine: plan.reproducibility.engineVersion,
    formulaManifest: plan.reproducibility.formulaManifestHash,
    inputHash: plan.reproducibility.inputHash,
    localePack: DETERMINISTIC_LOCALE_PACK_VERSION,
    model: "deterministic-template",
    planner: plan.plannerVersion,
    prompt: DETERMINISTIC_WRITER_VERSION,
    renderer: REPORT_RENDERER_VERSION,
    reportSchema: "1.0.0",
    safetyPolicy: REPORT_SAFETY_POLICY_VERSION,
    verifier: REPORT_VERIFIER_VERSION,
  };
  if (stableStringify(report.versions) !== stableStringify(expectedVersions)) {
    diagnostics.push(diagnostic("completeness", "REPORT_VERSION_VECTOR_MISMATCH"));
  }
  return { checkedCount, diagnostics };
}

export function checkGenericity(report: StructuredReport): GateCheck {
  const diagnostics = [];
  const specific = report.claims.filter(
    (claim) =>
      claim.factIds.length > 0 &&
      claim.ruleIds.length > 0 &&
      claim.sourceRefs.length > 0 &&
      claim.localized.body.some((paragraph) => paragraph.includes(claim.semanticSummary)),
  ).length;
  const score = report.claims.length === 0 ? 0 : specific / report.claims.length;
  if (score < 0.85) {
    diagnostics.push(diagnostic("genericity", "REPORT_SPECIFICITY_BELOW_THRESHOLD"));
  }
  return { checkedCount: report.claims.length, diagnostics };
}

function letterCount(text: string, pattern: RegExp): number {
  return [...text].filter((character) => pattern.test(character)).length;
}

export function checkLanguage(
  report: StructuredReport,
  expectedDoctrineLocale?: string,
): GateCheck {
  const spans = reportTextSpans(report);
  const text = spans.map((span) => span.text).join("\n");
  const letters = letterCount(text, /\p{L}/u);
  const devanagari = letterCount(text, /\p{Script=Devanagari}/u);
  const odia = letterCount(text, /\p{Script=Oriya}/u);
  const expectedLocale =
    expectedDoctrineLocale === undefined
      ? undefined
      : expectedDoctrineLocale === "en"
        ? "en-IN"
        : `${expectedDoctrineLocale}-IN`;
  const wrongLocale = expectedLocale !== undefined && report.locale !== expectedLocale;
  const wrongScript =
    report.locale === "en-IN"
      ? devanagari + odia > 0
      : report.locale === "hi-IN"
        ? letters === 0 || devanagari / letters < 0.25 || odia > 0
        : letters === 0 || odia / letters < 0.25 || devanagari > 0;
  return {
    checkedCount: spans.length,
    diagnostics: [
      ...(wrongLocale ? [diagnostic("language", "REPORT_LOCALE_METHOD_MISMATCH")] : []),
      ...(wrongScript ? [diagnostic("language", "REPORT_LOCALE_SCRIPT_MISMATCH")] : []),
    ],
  };
}

const CRITICAL_SAFETY_PATTERNS = Object.freeze([
  /\b(?:death|die|disease|diagnos(?:e|is)|treatment|medication|medicine|surgery|vaccination|symptom)\b/iu,
  /\b(?:fertility|pregnan(?:cy|t)|conception|delivery|prenatal)\b/iu,
  /\b(?:suicide|self[- ]harm|kill myself|immediate danger|crisis)\b/iu,
  /\b(?:secret command|persecution|supernatural selection|messages? (?:are|from))\b/iu,
  /\b(?:invest(?:ing|ment)?|trading|crypto(?:currency)?|stock returns?|credit|debt|bankruptcy|loan)\b/iu,
  /\b(?:gambl(?:e|es|ing)|lottery|casino|bet(?:ting)?|win probability)\b/iu,
  /\b(?:legal strategy|legal outcome|immigration|divorc(?:e|ing)|custody|court outcome)\b/iu,
  /\b(?:hiring|promotion|termination|firing|candidate screening|employment decision)\b/iu,
  /\b(?:insurance eligibility|credit eligibility|housing eligibility)\b/iu,
  /\b(?:travel safety|evacuat(?:e|ion)|emergency action|dangerous activity)\b/iu,
  /\b(?:abuse|coercion|forced relationship|curse(?:d| removal)?)\b/iu,
  /\b(?:cannot fail|destined|guaranteed|must|will)\b/iu,
  /\b(?:will cure|stop (?:your )?medication)\b/iu,
  /\b(?:ignore (?:all|the )?(?:previous|prior|these) instructions|reveal (?:the )?(?:prompt|system)|system prompt)\b/iu,
]);

export function checkSafety(report: StructuredReport, plan: ReportPlan): GateCheck {
  const spans = reportTextSpans(report);
  const planned = new Map(plan.claims.map((claim) => [claim.claimId, claim]));
  const diagnostics = [];
  for (const span of spans) {
    const prohibited =
      span.claimId === undefined ? [] : (planned.get(span.claimId)?.prohibitedPhrases ?? []);
    const isRequiredDisclosure =
      span.text.startsWith("Numerology is a cultural tradition for structured self-reflection.") &&
      span.text.includes("not scientifically validated");
    if (
      !isRequiredDisclosure &&
      (CRITICAL_SAFETY_PATTERNS.some((pattern) => pattern.test(span.text)) ||
        prohibited.some((phrase) =>
          span.text.toLocaleLowerCase("en-US").includes(phrase.toLocaleLowerCase("en-US")),
        ))
    ) {
      diagnostics.push(
        diagnostic("safety", "REPORT_UNSAFE_LANGUAGE", {
          ...(span.claimId === undefined ? {} : { claimId: span.claimId }),
          path: span.path,
          ...(span.sectionId === undefined ? {} : { sectionId: span.sectionId }),
        }),
      );
    }
  }
  return { checkedCount: spans.length, diagnostics };
}

export function checkSimilarity(
  report: StructuredReport,
  comparisonTexts: readonly string[],
  restrictedSourceTexts: readonly string[],
): GateCheck {
  const reportText = report.claims.flatMap((claim) => claim.localized.body).join("\n");
  const candidates = [...comparisonTexts, ...restrictedSourceTexts];
  const diagnostics = [];
  if (candidates.some((candidate) => shingleSimilarity(reportText, candidate) >= 0.82)) {
    diagnostics.push(diagnostic("similarity", "REPORT_LONG_SPAN_SIMILARITY"));
  }
  return { checkedCount: candidates.length, diagnostics };
}

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu;
const DATE_PATTERN = /\b\d{4}-\d{2}-\d{2}\b/u;
const PAYMENT_PATTERN = /\b(?:\d[ -]?){13,19}\b/u;
const PHONE_PATTERN = /(?:\+?91[ -]?)?[6-9]\d{9}\b/u;

function hasPii(text: string, canaries: readonly string[]): boolean {
  const normalized = text.normalize("NFC").toLocaleLowerCase("en-US");
  return (
    EMAIL_PATTERN.test(text) ||
    DATE_PATTERN.test(text) ||
    PAYMENT_PATTERN.test(text) ||
    PHONE_PATTERN.test(text) ||
    canaries.some((canary) => normalized.includes(canary))
  );
}

export function checkPii(report: StructuredReport, privateValues: readonly string[]): GateCheck {
  const spans = reportTextSpans(report);
  const canaries = privateValues
    .map((value) => value.normalize("NFC").toLocaleLowerCase("en-US").trim())
    .filter((value) => value.length >= 4);
  const diagnostics = [];
  for (const span of spans) {
    if (hasPii(span.text, canaries)) {
      diagnostics.push(
        diagnostic("pii", "REPORT_PRIVATE_DATA_LEAK", {
          ...(span.claimId === undefined ? {} : { claimId: span.claimId }),
          path: span.path,
          ...(span.sectionId === undefined ? {} : { sectionId: span.sectionId }),
        }),
      );
    }
  }
  // A display name is intentionally allowed to be a subject name, so canary-name matching does not
  // apply here; contact, date, payment, and phone data are never valid report metadata.
  if (hasPii(report.displayName, [])) {
    diagnostics.push(diagnostic("pii", "REPORT_PRIVATE_DATA_LEAK", { path: "displayName" }));
  }
  return { checkedCount: spans.length + 1, diagnostics };
}

export function reportInterpretiveText(report: StructuredReport): string {
  return normalizedWords(report.claims.flatMap((claim) => claim.localized.body).join(" ")).join(
    " ",
  );
}
