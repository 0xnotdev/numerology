import type { ReportSectionKey, SourceId } from "@numerology/doctrine";
import type { CalculatedFact, FactId } from "@numerology/engine";
import { parseReportSectionId, type ReportClaimId } from "./ids";
import { editorialSentence, editorialTemplateId } from "./section-copy";
import type {
  ReportBlock,
  ReportSection,
  SentenceProvenance,
  StructuredClaim,
} from "./structured-report";
import type { PlannedAction, PlannedSection } from "./types";
import { normalizedWords } from "./verification/text";
import type { DeterministicLocalePack } from "./writer-locale";

export const TEMPLATE_BY_SECTION: Readonly<Record<ReportSectionKey, ReportSection["templateKey"]>> =
  Object.freeze({
    actions: "actions",
    birthday_psychic_comparison: "core_number",
    core_overview: "core_number",
    cover_reading_guide: "welcome",
    current_name_comparison: "name_layers",
    growth_edges: "growth_edges",
    input_methods: "method",
    life_path: "core_number",
    lo_shu_augmented_comparison: "grid",
    lo_shu_raw_grid: "grid",
    methodology_appendix: "methodology_appendix",
    name_change_comparison: "name_layers",
    personal_months: "monthly_map",
    personal_year: "timing",
    relationships: "relationships",
    repeated_strengths: "strengths",
    western_name_layers: "name_layers",
    work_money: "work_money",
  });

const MONTH_LABELS = Object.freeze([
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]);

function editorialProvenance(
  text: string,
  templateId: string,
  extras: Partial<
    Pick<
      SentenceProvenance,
      "actionClassification" | "actionRuleTypes" | "claimId" | "factIds" | "ruleIds" | "sourceRefs"
    >
  > = {},
  kind: SentenceProvenance["kind"] = "editorial",
): SentenceProvenance {
  return {
    factIds: extras.factIds ?? [],
    kind,
    ruleIds: extras.ruleIds ?? [],
    sourceRefs: extras.sourceRefs ?? [],
    templateId,
    text,
    ...(extras.actionClassification === undefined
      ? {}
      : { actionClassification: extras.actionClassification }),
    ...(extras.actionRuleTypes === undefined ? {} : { actionRuleTypes: extras.actionRuleTypes }),
    ...(extras.claimId === undefined ? {} : { claimId: extras.claimId }),
  };
}

function claimProvenance(claim: StructuredClaim, text: string): SentenceProvenance {
  return {
    claimId: claim.claimId,
    factIds: claim.factIds,
    kind: "claim",
    ruleIds: claim.ruleIds,
    sourceRefs: claim.sourceRefs,
    templateId: "claim.text",
    text,
  };
}

function claimParagraphs(
  section: PlannedSection,
  claims: ReadonlyMap<ReportClaimId, StructuredClaim>,
): { readonly paragraphs: readonly string[]; readonly provenance: readonly SentenceProvenance[] } {
  const entries = section.claimIds.flatMap((claimId) => {
    const claim = claims.get(claimId);
    return claim === undefined
      ? []
      : claim.localized.body.map((text, index) => ({
          paragraph: text,
          provenance: claim.localized.sentenceProvenance[index] ?? claimProvenance(claim, text),
        }));
  });
  return {
    paragraphs: entries.map((entry) => entry.paragraph),
    provenance: entries.map((entry) => entry.provenance),
  };
}

function firstReservedFact(
  section: PlannedSection,
  facts: ReadonlyMap<FactId, CalculatedFact>,
  predicate: (fact: CalculatedFact) => boolean = () => true,
): FactId | undefined {
  return section.reservedFactIds.find((factId) => {
    const fact = facts.get(factId);
    return fact !== undefined && predicate(fact);
  });
}

function comparisonBlock(
  section: PlannedSection,
  facts: ReadonlyMap<FactId, CalculatedFact>,
  body: string,
  claims: ReadonlyMap<ReportClaimId, StructuredClaim>,
): ReportBlock | undefined {
  const candidates = section.reservedFactIds.filter((factId) => facts.has(factId));
  const leftFactId = candidates[0];
  const leftProfileId = leftFactId === undefined ? undefined : facts.get(leftFactId)?.profileId;
  const rightFactId = candidates.find(
    (factId) => factId !== leftFactId && facts.get(factId)?.profileId !== leftProfileId,
  );
  if (leftFactId === undefined || rightFactId === undefined) {
    return undefined;
  }
  const claim = section.claimIds.map((claimId) => claims.get(claimId)).find(Boolean);
  return {
    body,
    bodyProvenance: editorialProvenance(
      body,
      `block.${section.key}.body`,
      claim === undefined
        ? { factIds: [leftFactId, rightFactId] }
        : {
            claimId: claim.claimId,
            factIds: [leftFactId, rightFactId],
            ruleIds: claim.ruleIds,
            sourceRefs: claim.sourceRefs,
          },
    ),
    leftFactId,
    rightFactId,
    type: "comparison",
  };
}

function specialBlocks(
  section: PlannedSection,
  claims: ReadonlyMap<ReportClaimId, StructuredClaim>,
  facts: ReadonlyMap<FactId, CalculatedFact>,
  sourceIds: readonly SourceId[],
  actions: readonly PlannedAction[],
  locale: DeterministicLocalePack,
): readonly ReportBlock[] {
  switch (section.key) {
    case "cover_reading_guide": {
      const disclaimerParagraphs = locale.disclaimer
        .split(/(?<=\.)\s+/u)
        .map((paragraph) => paragraph.trim())
        .filter((paragraph) => paragraph.length > 0);
      return [
        {
          paragraphs: disclaimerParagraphs,
          sentenceProvenance: disclaimerParagraphs.map((paragraph, index) =>
            editorialProvenance(
              paragraph,
              index === 0 ? "safety.disclaimer" : `safety.disclaimer.${index}`,
              {},
              "safety",
            ),
          ),
          type: "prose",
        },
      ];
    }
    case "input_methods":
      return [
        {
          body: locale.methodsNote,
          bodyProvenance: editorialProvenance(
            locale.methodsNote,
            "method.methods-note",
            {
              sourceRefs: sourceIds,
            },
            "method",
          ),
          sourceRefs: sourceIds,
          type: "source_note",
        },
      ];
    case "core_overview": {
      const factId = firstReservedFact(section, facts);
      return factId === undefined
        ? []
        : [
            {
              caption: "A calculated position used in this report.",
              captionProvenance: editorialProvenance(
                "A calculated position used in this report.",
                "block.core_overview.caption",
                { factIds: [factId], sourceRefs: sourceIds },
              ),
              factId,
              type: "number_card",
            },
          ];
    }
    case "birthday_psychic_comparison": {
      const block = comparisonBlock(
        section,
        facts,
        "These calculated positions retain their named formula and interpretation boundaries.",
        claims,
      );
      return block === undefined ? [] : [block];
    }
    case "lo_shu_raw_grid": {
      const gridFactId = firstReservedFact(
        section,
        facts,
        (fact) => fact.profileId === "loshu_raw_dob_v1",
      );
      return gridFactId === undefined
        ? []
        : [
            {
              caption: "Raw civil-date counts in the fixed Lo Shu geometry.",
              captionProvenance: editorialProvenance(
                "Raw civil-date counts in the fixed Lo Shu geometry.",
                "block.lo_shu_raw_grid.caption",
                { factIds: [gridFactId], sourceRefs: sourceIds },
              ),
              gridFactId,
              type: "lo_shu",
            },
          ];
    }
    case "lo_shu_augmented_comparison": {
      const block = comparisonBlock(
        section,
        facts,
        "The raw and practitioner-augmented grids are shown separately and are never blended.",
        claims,
      );
      return block === undefined ? [] : [block];
    }
    case "personal_months": {
      const timelineClaimId = section.claimIds[0];
      const monthFacts = section.reservedFactIds
        .map((factId) => facts.get(factId))
        .filter(
          (fact): fact is CalculatedFact => fact?.metricId.startsWith("personal_month.") ?? false,
        )
        .sort(
          (left, right) => Number(left.metadata?.month ?? 0) - Number(right.metadata?.month ?? 0),
        );
      return timelineClaimId === undefined || monthFacts.length === 0
        ? []
        : [
            {
              items: monthFacts.map((fact, index) => {
                const month = Number(fact.metadata?.month);
                const label = MONTH_LABELS[month - 1] ?? `Month ${index + 1}`;
                const claim = claims.get(timelineClaimId);
                return {
                  claimId: timelineClaimId,
                  factId: fact.factId,
                  label,
                  provenance: editorialProvenance(
                    label,
                    `block.personal_months.item.${index}`,
                    claim === undefined
                      ? { factIds: [fact.factId] }
                      : {
                          claimId: claim.claimId,
                          factIds: [fact.factId],
                          ruleIds: claim.ruleIds,
                          sourceRefs: claim.sourceRefs,
                        },
                  ),
                };
              }),
              type: "timeline",
            },
          ];
    }
    case "actions": {
      const paragraphs = [locale.actionsIntroduction];
      const sentenceProvenance: SentenceProvenance[] = [
        editorialProvenance(
          locale.actionsIntroduction,
          "safety.actions-introduction",
          {},
          "safety",
        ),
      ];
      for (const action of actions) {
        for (const instruction of action.instructions) {
          const claim = action.claimIds.map((claimId) => claims.get(claimId)).find(Boolean);
          paragraphs.push(instruction);
          sentenceProvenance.push(
            editorialProvenance(
              instruction,
              `action.${action.actionId}`,
              claim === undefined
                ? {
                    actionClassification: action.classification ?? "practical_alternative",
                    actionRuleTypes: action.ruleTypes ?? [],
                    ruleIds: action.ruleIds,
                    sourceRefs: action.sourceIds,
                  }
                : {
                    actionClassification: action.classification ?? "practical_alternative",
                    actionRuleTypes: action.ruleTypes ?? [],
                    claimId: claim.claimId,
                    factIds: claim.factIds,
                    ruleIds: action.ruleIds,
                    sourceRefs: action.sourceIds,
                  },
              "action",
            ),
          );
        }
      }
      return [{ paragraphs, sentenceProvenance, type: "prose" }];
    }
    case "methodology_appendix":
      return [
        {
          body: locale.methodologyNote,
          bodyProvenance: editorialProvenance(
            locale.methodologyNote,
            "method.methodology-note",
            { sourceRefs: sourceIds },
            "method",
          ),
          sourceRefs: sourceIds,
          type: "source_note",
        },
      ];
    default:
      return [];
  }
}

function blockText(block: ReportBlock): readonly string[] {
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

function sectionWordCount(
  section: PlannedSection,
  blocks: readonly ReportBlock[],
  dek = "",
): number {
  return normalizedWords([section.label, dek, ...blocks.flatMap(blockText)].join(" ")).length;
}

function fillerForSection(
  section: PlannedSection,
  blocks: readonly ReportBlock[],
  dek = "",
): { readonly paragraphs: readonly string[]; readonly provenance: readonly SentenceProvenance[] } {
  const paragraphs: string[] = [];
  const provenance: SentenceProvenance[] = [];
  let words = sectionWordCount(section, blocks, dek);
  let index = 0;
  const minimumWords = Math.floor(section.wordBudget * 0.9);
  const maximumWords = Math.ceil(section.wordBudget * 1.1);
  while (words < section.wordBudget) {
    const text = editorialSentence(section.key, index);
    const addedWords = normalizedWords(text).length;
    if (words >= minimumWords && words + addedWords > maximumWords) break;
    paragraphs.push(text);
    provenance.push(editorialProvenance(text, editorialTemplateId(section.key, index)));
    words += addedWords;
    index += 1;
  }
  return { paragraphs, provenance };
}

function mergeProse(
  blocks: readonly ReportBlock[],
  paragraphs: readonly string[],
  provenance: readonly SentenceProvenance[],
): readonly ReportBlock[] {
  if (paragraphs.length === 0) return blocks;
  const index = blocks.findIndex((block) => block.type === "prose");
  if (index === -1) {
    return [...blocks, { paragraphs, sentenceProvenance: provenance, type: "prose" }];
  }
  const existing = blocks[index];
  if (existing === undefined || existing.type !== "prose") return blocks;
  return blocks.map((block, blockIndex) =>
    blockIndex === index
      ? {
          ...existing,
          paragraphs: [...existing.paragraphs, ...paragraphs],
          sentenceProvenance: [...existing.sentenceProvenance, ...provenance],
        }
      : block,
  );
}

export function writeSections(input: {
  readonly actions: readonly PlannedAction[];
  readonly claims: readonly StructuredClaim[];
  readonly facts: readonly CalculatedFact[];
  readonly locale: DeterministicLocalePack;
  readonly sections: readonly PlannedSection[];
  readonly sourceIds: readonly SourceId[];
}): readonly ReportSection[] {
  if (input.sourceIds.length === 0) {
    throw new RangeError("WRITER_SOURCE_REQUIRED");
  }
  const facts = new Map(input.facts.map((fact) => [fact.factId, fact]));
  const claims = new Map(input.claims.map((claim) => [claim.claimId, claim]));
  return input.sections.map((section) => {
    const special = specialBlocks(
      section,
      claims,
      facts,
      input.sourceIds,
      input.actions,
      input.locale,
    );
    const claimContent = claimParagraphs(section, claims);
    const initial = mergeProse(special, claimContent.paragraphs, claimContent.provenance);
    const filler = fillerForSection(section, initial, input.locale.sectionDeks[section.key]);
    const blocks = mergeProse(initial, filler.paragraphs, filler.provenance);
    return {
      blocks,
      claimIds: section.claimIds,
      dek: input.locale.sectionDeks[section.key],
      order: section.order,
      sectionId: parseReportSectionId(`section.${section.key}`),
      templateKey: TEMPLATE_BY_SECTION[section.key],
      title: section.label,
    };
  });
}
