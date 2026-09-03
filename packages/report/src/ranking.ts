import {
  doctrineProfileMethod,
  type ResolvedEvidence,
  type ResolvedSourceReference,
} from "@numerology/doctrine";
import { type CalculatedFact, canonicalHash, type FactId } from "@numerology/engine";
import { type ClaimCandidate, candidateRank, compareText, uniqueSorted } from "./candidate";
import { parseReportClaimId, type ReportClaimId } from "./ids";
import { ReportPlanningError } from "./types";

const CLAIM_CLASS_SCORE = Object.freeze({ A: 70, B: 60, C: 50, D: 40, E: 30, F: 20, G: 10 });
const CONFIDENCE_SCORE = Object.freeze({ high: 20, low: 0, medium: 10, unresolved: -100 });
const CORE_METRICS = new Set([
  "birthday",
  "destiny_number",
  "expression",
  "life_path",
  "name_number",
  "psychic_number",
]);

function referenceKey(reference: ResolvedSourceReference): string {
  return `${reference.sourceId}\u0000${reference.locator}`;
}

export function uniqueSourceReferences(
  references: readonly ResolvedSourceReference[],
): ResolvedSourceReference[] {
  const byKey = new Map(references.map((reference) => [referenceKey(reference), reference]));
  return [...byKey.values()].sort(
    (left, right) =>
      compareText(left.sourceId, right.sourceId) || compareText(left.locator, right.locator),
  );
}

function claimIdFor(
  item: ResolvedEvidence,
  themeId: string,
  valence: "strength" | "tension",
  text: string,
): ReportClaimId {
  return parseReportClaimId(
    `claim.${canonicalHash({ factId: item.factId, ruleId: item.ruleId, text, themeId, valence }).slice(7, 31)}`,
  );
}

function themeEntries(
  item: ResolvedEvidence,
): readonly { readonly themeId: string; readonly valence: "strength" | "tension" }[] {
  return [
    ...item.themes.constructive.map((themeId) => ({ themeId, valence: "strength" as const })),
    ...item.themes.tensions.map((themeId) => ({ themeId, valence: "tension" as const })),
  ];
}

function familiesByTheme(evidence: readonly ResolvedEvidence[]): ReadonlyMap<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  for (const item of evidence) {
    const familyId = doctrineProfileMethod(item.profileId).familyId;
    for (const { themeId } of themeEntries(item)) {
      const families = result.get(themeId) ?? new Set<string>();
      families.add(familyId);
      result.set(themeId, families);
    }
  }
  return result;
}

function scoreFor(item: ResolvedEvidence, fact: CalculatedFact, familySupport: number): number {
  return (
    CLAIM_CLASS_SCORE[item.claimClass] +
    CONFIDENCE_SCORE[item.confidence] +
    12 * Math.max(0, familySupport - 1) +
    (CORE_METRICS.has(fact.metricId) ? 8 : 0) +
    (item.actionIds.length > 0 ? 6 : 0) +
    (item.ruleType === "timing" ? 5 : 0)
  );
}

/** Creates one independently attributable candidate per authored claim/theme pair. */
export function buildClaimCandidates(
  evidenceInput: readonly ResolvedEvidence[],
  factsById: ReadonlyMap<FactId, CalculatedFact>,
): ClaimCandidate[] {
  const evidence = [...evidenceInput];
  const themeFamilies = familiesByTheme(evidence);
  const candidates: ClaimCandidate[] = [];
  for (const item of evidence) {
    const fact = factsById.get(item.factId);
    if (fact === undefined) {
      throw new ReportPlanningError("EVIDENCE_FACT_UNKNOWN");
    }
    const profile = doctrineProfileMethod(fact.profileId);
    for (const { themeId, valence } of themeEntries(item)) {
      // Tension prose without a resolved action would leave a reviewer no bounded next step.
      if (valence === "tension" && item.actionIds.length === 0) {
        continue;
      }
      for (const text of item.claims) {
        const sourceReferences = uniqueSourceReferences(item.sourceReferences);
        candidates.push({
          actionIds: uniqueSorted(item.actionIds),
          allowedDisplayNumbers: uniqueSorted(fact.displayTokens),
          claimClass: item.claimClass,
          claimId: claimIdFor(item, themeId, valence, text),
          confidence: item.confidence,
          contradictionIds: [],
          contradictionResolutions: [],
          contentHashes: [item.contentHash],
          evidence: [item],
          factIds: [fact.factId],
          factLinks: [
            {
              factId: fact.factId,
              profileId: fact.profileId,
              traceIds: uniqueSorted(fact.traceIds),
            },
          ],
          independentProfileFamilyIds: [profile.familyId],
          mandatory: false,
          primaryRoot: fact.root === 0 ? null : fact.root,
          profileIds: [fact.profileId],
          prohibitedPhrases: uniqueSorted(item.prohibitedPhrases),
          relationship: "unique_signal",
          reviewers: uniqueSorted(item.reviewers),
          reviewState: item.reviewState,
          ruleIds: [item.ruleId],
          ruleTypes: [item.ruleType],
          ruleVersions: [item.ruleVersion],
          safetyTags: uniqueSorted(item.safetyTags),
          score: scoreFor(item, fact, themeFamilies.get(themeId)?.size ?? 1),
          sectionKey: item.sectionKey,
          sourceIds: uniqueSorted(item.sourceIds),
          sourceReferences,
          text,
          themeId,
          timing: item.ruleType === "timing",
          valence,
          wordBudget: item.ruleType === "timing" ? 70 : 80,
        });
      }
    }
  }
  return candidates.sort(candidateRank);
}

/** Applies the cap after total deterministic ranking, independently for each authored theme. */
export function enforceThemeClaimCap(
  candidates: readonly ClaimCandidate[],
  maxClaimsPerTheme: number,
): ClaimCandidate[] {
  const selected: ClaimCandidate[] = [];
  const counts = new Map<string, number>();
  for (const candidate of [...candidates].sort(candidateRank)) {
    const count = counts.get(candidate.themeId) ?? 0;
    if (count < maxClaimsPerTheme) {
      selected.push(candidate);
      counts.set(candidate.themeId, count + 1);
    }
  }
  return selected;
}

/** Avoids an editorial run of more than two tension claims in ranked reading order. */
export function balanceClaimValence(candidates: readonly ClaimCandidate[]): ClaimCandidate[] {
  let consecutiveTensions = 0;
  return candidates.filter((candidate) => {
    if (candidate.valence !== "tension") {
      consecutiveTensions = 0;
      return true;
    }
    consecutiveTensions += 1;
    return consecutiveTensions <= 2;
  });
}
