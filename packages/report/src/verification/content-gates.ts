import type { ReportSectionKey } from "@numerology/doctrine";
import { stableStringify } from "@numerology/engine";
import {
  DETERMINISTIC_WRITER_POLICY_VERSION,
  REPORT_RENDERER_VERSION,
  REPORT_SAFETY_POLICY_VERSION,
  REPORT_VERIFIER_VERSION,
} from "../report-versions";
import type {
  ReportBlock,
  ReportSection,
  SentenceProvenance,
  StructuredReport,
} from "../structured-report";
import type { ReportPlan } from "../types";
import {
  DETERMINISTIC_LOCALE_PACK_VERSION,
  DETERMINISTIC_WRITER_VERSION,
  deterministicLocalePack,
} from "../writer-locale";
import { approvedEditorialSentence, approvedEditorialTemplateId } from "./approved-copy";
import { diagnostic, type GateCheck } from "./diagnostics";
import { normalizedWords, reportTextSpans, shingleSimilarity } from "./text";

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
  let locale: ReturnType<typeof deterministicLocalePack> | undefined;
  try {
    locale = deterministicLocalePack(report.locale);
  } catch {
    diagnostics.push(diagnostic("completeness", "REPORT_LOCALE_PACK_UNAVAILABLE"));
  }
  plan.sections.forEach((planned, index) => {
    checkedCount += 1;
    const section = report.sections[index];
    if (
      section === undefined ||
      section.order !== planned.order ||
      section.sectionId !== `section.${planned.key}` ||
      section.templateKey !== expectedTemplate(planned.key) ||
      section.title !== planned.label ||
      section.dek !== locale?.sectionDeks[planned.key] ||
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
  if (locale !== undefined && report.title !== locale.reportTitle) {
    diagnostics.push(diagnostic("completeness", "REPORT_TITLE_NOT_APPROVED", { path: "title" }));
  }

  checkedCount += 13;
  const expectedVersions = {
    doctrine: plan.reproducibility.doctrineReleaseId,
    doctrineHash: plan.reproducibility.doctrineReleaseHash,
    engine: plan.reproducibility.engineVersion,
    formulaManifest: plan.reproducibility.formulaManifestHash,
    inputHash: plan.reproducibility.inputHash,
    localePack: DETERMINISTIC_LOCALE_PACK_VERSION,
    planner: plan.plannerVersion,
    renderer: REPORT_RENDERER_VERSION,
    reportSchema: "1.0.0",
    safetyPolicy: REPORT_SAFETY_POLICY_VERSION,
    verifier: REPORT_VERIFIER_VERSION,
    writer: DETERMINISTIC_WRITER_VERSION,
    writerPolicy: DETERMINISTIC_WRITER_POLICY_VERSION,
  };
  if (stableStringify(report.versions) !== stableStringify(expectedVersions)) {
    diagnostics.push(diagnostic("completeness", "REPORT_VERSION_VECTOR_MISMATCH"));
  }
  return { checkedCount, diagnostics };
}

function expectedTemplate(key: ReportSectionKey): ReportSection["templateKey"] {
  switch (key) {
    case "actions":
      return "actions";
    case "birthday_psychic_comparison":
    case "core_overview":
    case "life_path":
      return "core_number";
    case "cover_reading_guide":
      return "welcome";
    case "current_name_comparison":
    case "name_change_comparison":
    case "western_name_layers":
      return "name_layers";
    case "growth_edges":
      return "growth_edges";
    case "input_methods":
      return "method";
    case "lo_shu_augmented_comparison":
    case "lo_shu_raw_grid":
      return "grid";
    case "methodology_appendix":
      return "methodology_appendix";
    case "personal_months":
      return "monthly_map";
    case "personal_year":
      return "timing";
    case "relationships":
      return "relationships";
    case "repeated_strengths":
      return "strengths";
    case "work_money":
      return "work_money";
  }
}

function headingForTheme(themeId: string): string {
  const heading = themeId
    .replace(/^contradiction\./u, "Method boundary: ")
    .replace(/[._-]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  return `${heading.charAt(0).toUpperCase()}${heading.slice(1)}`;
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

function textForBlock(block: ReportBlock): readonly string[] {
  switch (block.type) {
    case "prose":
      return block.paragraphs;
    case "number_card":
    case "lo_shu":
      return [block.caption];
    case "comparison":
    case "source_note":
      return [block.body];
    case "timeline":
      return block.items.map((item) => item.label);
  }
}

function sectionWordCount(section: ReportSection): number {
  return normalizedWords(
    [section.title, section.dek, ...section.blocks.flatMap(textForBlock)].join(" "),
  ).length;
}

export function checkLength(report: StructuredReport, plan: ReportPlan): GateCheck {
  const diagnostics = [];
  let checkedCount = 0;
  let total = 0;
  for (const planned of plan.sections) {
    const section = report.sections.find(
      (candidate) => candidate.sectionId === `section.${planned.key}`,
    );
    const actual = section === undefined ? 0 : sectionWordCount(section);
    total += actual;
    checkedCount += actual;
    if (
      actual < Math.floor(planned.wordBudget * 0.9) ||
      actual > Math.ceil(planned.wordBudget * 1.1)
    ) {
      diagnostics.push(
        diagnostic("length", "REPORT_SECTION_WORD_BUDGET_OUT_OF_RANGE", {
          sectionId: `section.${planned.key}`,
        }),
      );
    }
  }
  checkedCount += 1;
  if (total < 7_500 || total > 10_000) {
    diagnostics.push(diagnostic("length", "REPORT_TOTAL_WORD_BUDGET_OUT_OF_RANGE"));
  }
  return { checkedCount, diagnostics };
}

function refArraysMatch(left: SentenceProvenance, right: SentenceProvenance): boolean {
  return (
    sameStrings(left.factIds, right.factIds) &&
    sameStrings(left.ruleIds, right.ruleIds) &&
    sameStrings(left.sourceRefs, right.sourceRefs)
  );
}

function sentenceParts(text: string): readonly string[] {
  const parts = text.match(/[^.!?]+[.!?]+/gu)?.map((part) => part.trim()) ?? [];
  return parts.length === 0 ? [text] : parts;
}

function isSingleSentence(text: string): boolean {
  const sentences = sentenceParts(text);
  return sentences.length === 1 && sentences[0] === text.trim();
}

function expectedActionText(claimId: string, plan: ReportPlan): string | undefined {
  const instructions = plan.actions
    .filter((action) => action.claimIds.includes(claimId as never))
    .flatMap((action) => action.instructions);
  return instructions.length === 0 ? undefined : [...new Set(instructions)].sort().join(" ");
}

const STATIC_BLOCK_TEXT: Readonly<Record<string, string>> = Object.freeze({
  "birthday_psychic_comparison.body":
    "These calculated positions retain their named formula and interpretation boundaries.",
  "lo_shu_augmented_comparison.body":
    "The raw and practitioner-augmented grids are shown separately and are never blended.",
  "lo_shu_raw_grid.caption": "Raw civil-date counts in the fixed Lo Shu geometry.",
  "core_overview.caption": "A calculated position used in this report.",
});

function checkSentence(
  text: string,
  ref: SentenceProvenance | undefined,
  path: string,
  diagnostics: ReturnType<typeof diagnostic>[],
  requireSentence = true,
): void {
  if (
    ref === undefined ||
    ref.text !== text ||
    (requireSentence && !isSingleSentence(text)) ||
    (ref.kind === "claim" && ref.claimId === undefined)
  ) {
    diagnostics.push(
      diagnostic("prose_provenance", "REPORT_SENTENCE_PROVENANCE_INVALID", { path }),
    );
  }
}

function checkClaimProvenance(
  report: StructuredReport,
  plan: ReportPlan,
  diagnostics: ReturnType<typeof diagnostic>[],
): number {
  const planned = new Map(plan.claims.map((claim) => [claim.claimId, claim]));
  let checkedCount = 0;
  for (const [claimIndex, claim] of report.claims.entries()) {
    const expected = planned.get(claim.claimId);
    checkedCount += claim.localized.body.length + (claim.localized.action === undefined ? 0 : 1);
    if (expected !== undefined && claim.localized.heading !== headingForTheme(expected.themeId)) {
      diagnostics.push(
        diagnostic("prose_provenance", "REPORT_CLAIM_HEADING_NOT_APPROVED", {
          claimId: claim.claimId,
          path: `claims.${claimIndex}.localized.heading`,
        }),
      );
    }
    if (
      expected === undefined ||
      claim.localized.body.length !== claim.localized.sentenceProvenance.length ||
      !sameStrings(claim.localized.body, sentenceParts(expected.text))
    ) {
      diagnostics.push(
        diagnostic("prose_provenance", "REPORT_CLAIM_SENTENCE_NOT_BOUND", {
          claimId: claim.claimId,
          path: `claims.${claimIndex}.localized.body`,
        }),
      );
    }
    claim.localized.body.forEach((text, bodyIndex) => {
      const ref = claim.localized.sentenceProvenance[bodyIndex];
      checkSentence(text, ref, `claims.${claimIndex}.localized.body.${bodyIndex}`, diagnostics);
      if (
        expected !== undefined &&
        (ref === undefined ||
          ref.kind !== "claim" ||
          ref.claimId !== claim.claimId ||
          !refArraysMatch(ref, {
            claimId: claim.claimId,
            factIds: expected.factIds,
            kind: "claim",
            ruleIds: expected.ruleIds,
            sourceRefs: expected.sourceIds,
            templateId: "claim.text",
            text,
          }))
      ) {
        diagnostics.push(
          diagnostic("prose_provenance", "REPORT_CLAIM_SENTENCE_NOT_BOUND", {
            claimId: claim.claimId,
            path: `claims.${claimIndex}.localized.body.${bodyIndex}`,
          }),
        );
      }
    });
    const expectedAction =
      expected === undefined ? undefined : expectedActionText(claim.claimId, plan);
    if (claim.localized.action !== expectedAction) {
      diagnostics.push(
        diagnostic("prose_provenance", "REPORT_ACTION_PROVENANCE_INVALID", {
          claimId: claim.claimId,
          path: `claims.${claimIndex}.localized.action`,
        }),
      );
    }
    if (claim.localized.action !== undefined) {
      const ref = claim.localized.actionProvenance;
      checkSentence(
        claim.localized.action,
        ref,
        `claims.${claimIndex}.localized.action`,
        diagnostics,
      );
      if (
        ref === undefined ||
        ref.kind !== "action" ||
        ref.claimId !== claim.claimId ||
        ref.templateId !== "action.instructions" ||
        expected === undefined ||
        !refArraysMatch(ref, {
          claimId: claim.claimId,
          factIds: expected.factIds,
          kind: "action",
          ruleIds: expected.ruleIds,
          sourceRefs: expected.sourceIds,
          templateId: "action.instructions",
          text: claim.localized.action,
        })
      ) {
        diagnostics.push(
          diagnostic("prose_provenance", "REPORT_ACTION_PROVENANCE_INVALID", {
            claimId: claim.claimId,
            path: `claims.${claimIndex}.localized.actionProvenance`,
          }),
        );
      }
    }
  }
  return checkedCount;
}

function checkSectionProvenance(
  report: StructuredReport,
  plan: ReportPlan,
  diagnostics: ReturnType<typeof diagnostic>[],
): number {
  const claims = new Map(report.claims.map((claim) => [claim.claimId, claim]));
  const plannedClaims = new Map(plan.claims.map((claim) => [claim.claimId, claim]));
  const plannedSections = new Map(plan.sections.map((section) => [section.key, section]));
  let locale: ReturnType<typeof deterministicLocalePack> | undefined;
  try {
    locale = deterministicLocalePack(report.locale);
  } catch {
    diagnostics.push(diagnostic("prose_provenance", "REPORT_LOCALE_PACK_UNAVAILABLE"));
  }
  let checkedCount = 0;
  if (locale === undefined) return checkedCount;
  for (const [sectionIndex, section] of report.sections.entries()) {
    const key = section.sectionId.replace(/^section\./u, "") as ReportSectionKey;
    const plannedSection = plannedSections.get(key);
    if (plannedSection === undefined) continue;
    for (const [blockIndex, block] of section.blocks.entries()) {
      const path = `sections.${sectionIndex}.blocks.${blockIndex}`;
      const refs =
        block.type === "prose"
          ? block.sentenceProvenance
          : block.type === "number_card" || block.type === "lo_shu"
            ? [block.captionProvenance]
            : block.type === "comparison" || block.type === "source_note"
              ? [block.bodyProvenance]
              : block.items.map((item) => item.provenance);
      const texts = textForBlock(block);
      checkedCount += texts.length;
      if (texts.length !== refs.length) {
        diagnostics.push(
          diagnostic("prose_provenance", "REPORT_SENTENCE_PROVENANCE_INVALID", { path }),
        );
        continue;
      }
      texts.forEach((text, index) => {
        const ref = refs[index];
        checkSentence(text, ref, `${path}.text.${index}`, diagnostics, block.type !== "timeline");
        if (ref === undefined) return;
        const claim = ref.claimId === undefined ? undefined : claims.get(ref.claimId);
        const plannedClaim = ref.claimId === undefined ? undefined : plannedClaims.get(ref.claimId);
        if (ref.kind === "claim") {
          if (
            claim === undefined ||
            plannedClaim === undefined ||
            !plannedSection.claimIds.includes(ref.claimId as never) ||
            !sentenceParts(plannedClaim.text).includes(text) ||
            ref.templateId !== "claim.text" ||
            !refArraysMatch(ref, {
              claimId: plannedClaim.claimId,
              factIds: plannedClaim.factIds,
              kind: "claim",
              ruleIds: plannedClaim.ruleIds,
              sourceRefs: plannedClaim.sourceIds,
              templateId: "claim.text",
              text,
            })
          ) {
            diagnostics.push(
              diagnostic("prose_provenance", "REPORT_SECTION_SENTENCE_NOT_BOUND", {
                path: `${path}.text.${index}`,
                ...(ref.claimId === undefined ? {} : { claimId: ref.claimId }),
                sectionId: section.sectionId,
              }),
            );
          }
        } else if (ref.kind === "editorial") {
          const prefix = `editorial.${key}.`;
          const ordinal = ref.templateId.startsWith(prefix)
            ? Number(ref.templateId.slice(prefix.length))
            : Number.NaN;
          const isApprovedSectionCopy =
            Number.isSafeInteger(ordinal) &&
            ordinal >= 0 &&
            ref.templateId === approvedEditorialTemplateId(key, ordinal) &&
            text === approvedEditorialSentence(key, ordinal);
          const isApprovedBlockCopy = ref.templateId.startsWith("block.");
          if (!isApprovedSectionCopy && !isApprovedBlockCopy) {
            diagnostics.push(
              diagnostic("prose_provenance", "REPORT_EDITORIAL_SENTENCE_NOT_APPROVED", {
                path: `${path}.text.${index}`,
                sectionId: section.sectionId,
              }),
            );
          }
        } else if (ref.kind === "safety") {
          const disclaimerParts = locale.disclaimer.split(/(?<=\.)\s+/u);
          const expected =
            ref.templateId === "safety.disclaimer"
              ? disclaimerParts[0]
              : ref.templateId.startsWith("safety.disclaimer.")
                ? disclaimerParts[Number(ref.templateId.slice("safety.disclaimer.".length))]
                : ref.templateId === "safety.actions-introduction"
                  ? locale.actionsIntroduction
                  : undefined;
          if (expected !== text) {
            diagnostics.push(
              diagnostic("prose_provenance", "REPORT_SAFETY_SENTENCE_NOT_APPROVED", {
                path: `${path}.text.${index}`,
              }),
            );
          }
        } else if (ref.kind === "method") {
          const expected =
            ref.templateId === "method.methods-note"
              ? locale.methodsNote
              : ref.templateId === "method.methodology-note"
                ? locale.methodologyNote
                : undefined;
          if (expected !== text) {
            diagnostics.push(
              diagnostic("prose_provenance", "REPORT_METHOD_SENTENCE_NOT_APPROVED", {
                path: `${path}.text.${index}`,
              }),
            );
          }
        } else if (ref.kind === "action") {
          const actionId = ref.templateId.replace(/^action\./u, "");
          const action = plan.actions.find((candidate) => candidate.actionId === actionId);
          if (
            action === undefined ||
            !action.instructions.includes(text) ||
            ref.templateId !== `action.${action.actionId}`
          ) {
            diagnostics.push(
              diagnostic("prose_provenance", "REPORT_ACTION_PROVENANCE_INVALID", {
                path: `${path}.text.${index}`,
                sectionId: section.sectionId,
              }),
            );
          }
        }
      });
      if (block.type === "number_card" || block.type === "lo_shu") {
        const expected = STATIC_BLOCK_TEXT[`${key}.caption`];
        if (expected !== undefined && block.caption !== expected) {
          diagnostics.push(
            diagnostic("prose_provenance", "REPORT_BLOCK_TEXT_NOT_APPROVED", { path }),
          );
        }
        const linkedFactId = block.type === "number_card" ? block.factId : block.gridFactId;
        if (!block.captionProvenance.factIds.includes(linkedFactId)) {
          diagnostics.push(
            diagnostic("prose_provenance", "REPORT_BLOCK_FACT_NOT_BOUND", {
              path,
              factId: linkedFactId,
            }),
          );
        }
      }
      if (block.type === "comparison") {
        const expected = STATIC_BLOCK_TEXT[`${key}.body`];
        if (expected !== undefined && block.body !== expected) {
          diagnostics.push(
            diagnostic("prose_provenance", "REPORT_BLOCK_TEXT_NOT_APPROVED", { path }),
          );
        }
        if (
          !block.bodyProvenance.factIds.includes(block.leftFactId) ||
          !block.bodyProvenance.factIds.includes(block.rightFactId)
        ) {
          diagnostics.push(diagnostic("prose_provenance", "REPORT_BLOCK_FACT_NOT_BOUND", { path }));
        }
      }
      if (
        block.type === "source_note" &&
        !sameStrings(block.sourceRefs, block.bodyProvenance.sourceRefs)
      ) {
        diagnostics.push(diagnostic("prose_provenance", "REPORT_SOURCE_NOTE_NOT_BOUND", { path }));
      }
      if (block.type === "timeline") {
        block.items.forEach((item, itemIndex) => {
          if (
            item.provenance.text !== item.label ||
            item.provenance.factIds.includes(item.factId) === false
          ) {
            diagnostics.push(
              diagnostic("prose_provenance", "REPORT_TIMELINE_ITEM_NOT_BOUND", {
                path: `${path}.items.${itemIndex}`,
                claimId: item.claimId,
                factId: item.factId,
              }),
            );
          }
        });
      }
    }
  }
  return checkedCount;
}

export function checkProseProvenance(report: StructuredReport, plan: ReportPlan): GateCheck {
  const diagnostics: ReturnType<typeof diagnostic>[] = [];
  const checkedCount =
    checkClaimProvenance(report, plan, diagnostics) +
    checkSectionProvenance(report, plan, diagnostics);
  return { checkedCount, diagnostics };
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
  /\b(?:cannot fail|destined|guaranteed|must|will|inevitable|certain(?:ly)?|only true|only way)\b/iu,
  /\b(?:will cure|stop (?:your )?medication)\b/iu,
  /\b(?:give|send|transfer|hand over)\b[^.!?]{0,100}\b(?:money|savings|funds|cash|account)\b/iu,
  /(?:₹|rs\.?|inr|\$|€|£)\s*\d[\d,.]*|\b\d[\d,.]*\s*(?:lakh|lakhs|crore|crores)\b/iu,
  /\b(?:ignore (?:all|the )?(?:previous|prior|these) instructions|reveal (?:the )?(?:prompt|system)|system prompt|follow these instructions)\b/iu,
]);

const DISPLAY_NAME_INSTRUCTION_PATTERNS = Object.freeze([
  /\b(?:ignore|disregard)\b[^.!?]{0,80}\b(?:instruction|prompt|system)\b/iu,
  /\b(?:reveal|show|print)\b[^.!?]{0,80}\b(?:prompt|system|secret)\b/iu,
  /(?:<\/?(?:system|instruction|prompt)>|\[\[(?:system|instruction)\]\])/iu,
]);

export function checkSafety(report: StructuredReport, plan: ReportPlan): GateCheck {
  const spans = reportTextSpans(report);
  const planned = new Map(plan.claims.map((claim) => [claim.claimId, claim]));
  const diagnostics = [];
  for (const span of spans) {
    const prohibited =
      span.claimId === undefined ? [] : (planned.get(span.claimId)?.prohibitedPhrases ?? []);
    const isRequiredDisclosure =
      (span.text.startsWith("Numerology is a cultural tradition for structured self-reflection.") &&
        span.text.includes("not scientifically validated")) ||
      (span.sectionId === "section.cover_reading_guide" &&
        span.text.startsWith("It is not scientifically validated prediction"));
    const unsafe =
      span.path === "displayName"
        ? DISPLAY_NAME_INSTRUCTION_PATTERNS.some((pattern) => pattern.test(span.text))
        : !isRequiredDisclosure &&
          (CRITICAL_SAFETY_PATTERNS.some((pattern) => pattern.test(span.text)) ||
            prohibited.some((phrase) =>
              span.text.toLocaleLowerCase("en-US").includes(phrase.toLocaleLowerCase("en-US")),
            ));
    if (unsafe) {
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

export function checkRepetition(report: StructuredReport): GateCheck {
  const sentences = reportTextSpans(report).map((span) => normalizedWords(span.text).join(" "));
  const unique = new Set(sentences.filter((sentence) => sentence.length > 0));
  const repeated = sentences.length - unique.size;
  const diagnostics =
    repeated * 100 > sentences.length * 8
      ? [diagnostic("repetition", "REPORT_REPETITION_ABOVE_THRESHOLD")]
      : [];
  return { checkedCount: sentences.length, diagnostics };
}

export function checkSimilarity(
  report: StructuredReport,
  comparisonTexts: readonly string[],
  restrictedSourceTexts: readonly string[],
): GateCheck {
  const reportText = reportTextSpans(report)
    .filter((span) => span.path !== "displayName")
    .map((span) => span.text)
    .join("\n");
  const candidates = [...comparisonTexts, ...restrictedSourceTexts];
  const diagnostics = [];
  if (candidates.length === 0) {
    diagnostics.push(diagnostic("similarity", "REPORT_SIMILARITY_CONTEXT_UNAVAILABLE"));
  } else if (candidates.some((candidate) => shingleSimilarity(reportText, candidate) >= 0.82)) {
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
    if (span.path === "displayName") continue;
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
  // A display name is intentionally allowed to be a subject name; contact, date, payment, and phone
  // data remain invalid metadata, while instruction-shaped names are handled by the safety gate.
  if (hasPii(report.displayName, [])) {
    diagnostics.push(diagnostic("pii", "REPORT_PRIVATE_DATA_LEAK", { path: "displayName" }));
  }
  return { checkedCount: spans.length, diagnostics };
}

export function reportInterpretiveText(report: StructuredReport): string {
  return normalizedWords(report.claims.flatMap((claim) => claim.localized.body).join(" ")).join(
    " ",
  );
}
