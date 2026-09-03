import { doctrineProfileMethod, EDITORIAL_SECTIONS } from "@numerology/doctrine";
import type { CalculatedFact, CalculationBundle, FactId } from "@numerology/engine";
import { type ClaimCandidate, compareText, uniqueSorted } from "./candidate";
import type { PlannedSection } from "./types";

const CORE_METRICS = new Set([
  "birthday",
  "destiny_number",
  "expression",
  "life_path",
  "name_number",
  "psychic_number",
]);

function reservedFactsForSection(
  sectionKey: PlannedSection["key"],
  facts: readonly CalculatedFact[],
): readonly FactId[] {
  const metricIds = (() => {
    switch (sectionKey) {
      case "core_overview":
        return CORE_METRICS;
      case "life_path":
        return new Set(["life_path"]);
      case "birthday_psychic_comparison":
        return new Set(["birthday", "destiny_number", "psychic_number"]);
      case "current_name_comparison":
        return new Set(["name_number"]);
      case "lo_shu_raw_grid":
      case "lo_shu_augmented_comparison":
        return new Set(["grid"]);
      case "personal_year":
        return new Set(["personal_year"]);
      case "personal_months":
        return new Set(
          Array.from(
            { length: 12 },
            (_, index) => `personal_month.${String(index + 1).padStart(2, "0")}`,
          ),
        );
      case "methodology_appendix":
        return null;
      default:
        return new Set<string>();
    }
  })();
  return uniqueSorted(
    facts
      .filter((fact) => metricIds === null || metricIds.has(fact.metricId))
      .map((fact) => fact.factId),
  );
}

export function buildSections(
  claims: readonly ClaimCandidate[],
  facts: readonly CalculatedFact[],
): PlannedSection[] {
  return EDITORIAL_SECTIONS.map((section) => ({
    claimIds: claims
      .filter((claim) => claim.sectionKey === section.key)
      .map((claim) => claim.claimId)
      .sort(compareText),
    key: section.key,
    label: section.label,
    order: section.order,
    reserved: true as const,
    reservedFactIds: reservedFactsForSection(section.key, facts),
    wordBudget: section.wordBudget,
  }));
}

export function profileMethodsForBundle(bundle: CalculationBundle) {
  return uniqueSorted(bundle.facts.map((fact) => fact.profileId)).map(doctrineProfileMethod);
}
