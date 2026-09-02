import type { ReportSectionKey, SourceId } from "@numerology/doctrine";
import type { CalculatedFact, FactId } from "@numerology/engine";
import { parseReportSectionId } from "./ids";
import type { DeterministicLocalePack } from "./writer-locale";
import type { PlannedAction, PlannedSection } from "./types";
import type { ReportBlock, ReportSection, StructuredClaim } from "./structured-report";

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

function claimParagraphs(
  section: PlannedSection,
  claims: ReadonlyMap<string, StructuredClaim>,
): readonly string[] {
  return section.claimIds.flatMap((claimId) => claims.get(claimId)?.localized.body ?? []);
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
  return { body, leftFactId, rightFactId, type: "comparison" };
}

function specialBlocks(
  section: PlannedSection,
  _claims: ReadonlyMap<string, StructuredClaim>,
  facts: ReadonlyMap<FactId, CalculatedFact>,
  sourceIds: readonly SourceId[],
  actions: readonly PlannedAction[],
  locale: DeterministicLocalePack,
): readonly ReportBlock[] {
  switch (section.key) {
    case "cover_reading_guide":
      return [{ paragraphs: [locale.disclaimer], type: "prose" }];
    case "input_methods":
      return [{ body: locale.methodsNote, sourceRefs: sourceIds, type: "source_note" }];
    case "core_overview": {
      const factId = firstReservedFact(section, facts);
      return factId === undefined
        ? []
        : [{ caption: "A calculated position used in this report.", factId, type: "number_card" }];
    }
    case "birthday_psychic_comparison": {
      const block = comparisonBlock(
        section,
        facts,
        "These calculated positions retain their named formula and interpretation boundaries.",
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
                return {
                  claimId: timelineClaimId,
                  factId: fact.factId,
                  label: MONTH_LABELS[month - 1] ?? `Month ${index + 1}`,
                };
              }),
              type: "timeline",
            },
          ];
    }
    case "actions": {
      const paragraphs = [
        locale.actionsIntroduction,
        ...actions.flatMap((action) => action.instructions),
      ];
      return [{ paragraphs, type: "prose" }];
    }
    case "methodology_appendix":
      return [{ body: locale.methodologyNote, sourceRefs: sourceIds, type: "source_note" }];
    default:
      return [];
  }
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
    const paragraphs = claimParagraphs(section, claims);
    const prose: readonly ReportBlock[] =
      paragraphs.length > 0
        ? [{ paragraphs, type: "prose" }]
        : special.length === 0
          ? [{ paragraphs: [input.locale.sectionDeks[section.key]], type: "prose" }]
          : [];
    return {
      blocks: [...special, ...prose],
      claimIds: section.claimIds,
      dek: input.locale.sectionDeks[section.key],
      order: section.order,
      sectionId: parseReportSectionId(`section.${section.key}`),
      templateKey: TEMPLATE_BY_SECTION[section.key],
      title: section.label,
    };
  });
}
