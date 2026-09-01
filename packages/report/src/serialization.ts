import { stableStringify } from "@numerology/engine";
import { compareText, type ClaimCandidate } from "./candidate";
import { evidenceKey } from "./evidence";
import type { PlanStatistics, PlannedClaim, ReportPlan } from "./types";

export function toPlannedClaims(candidates: readonly ClaimCandidate[]): PlannedClaim[] {
  return candidates.map((candidate) => ({
    actionIds: candidate.actionIds,
    allowedDisplayNumbers: candidate.allowedDisplayNumbers,
    claimClass: candidate.claimClass,
    claimId: candidate.claimId,
    confidence: candidate.confidence,
    contradictionIds: candidate.contradictionIds,
    contradictionResolutions: candidate.contradictionResolutions,
    contentHashes: candidate.contentHashes,
    factIds: candidate.factIds,
    factLinks: candidate.factLinks,
    independentProfileFamilyIds: candidate.independentProfileFamilyIds,
    profileIds: candidate.profileIds,
    prohibitedPhrases: candidate.prohibitedPhrases,
    relationship: candidate.relationship,
    reviewers: candidate.reviewers,
    reviewState: candidate.reviewState,
    ruleIds: candidate.ruleIds,
    ruleTypes: candidate.ruleTypes,
    ruleVersions: candidate.ruleVersions,
    safetyTags: candidate.safetyTags,
    score: candidate.score,
    sectionKey: candidate.sectionKey,
    sourceIds: candidate.sourceIds,
    sourceReferences: candidate.sourceReferences,
    text: candidate.text,
    themeId: candidate.themeId,
    valence: candidate.valence,
    wordBudget: candidate.wordBudget,
  }));
}

export function planStatistics(candidates: readonly ClaimCandidate[]): PlanStatistics {
  const roots: Record<string, number> = {};
  const themes: Record<string, number> = {};
  const evidenceIdentities = new Set<string>();
  for (const candidate of candidates) {
    if (candidate.primaryRoot !== null) {
      const root = String(candidate.primaryRoot);
      roots[root] = (roots[root] ?? 0) + candidate.wordBudget;
    }
    if (!candidate.mandatory) {
      themes[candidate.themeId] = (themes[candidate.themeId] ?? 0) + 1;
    }
    for (const item of candidate.evidence) {
      evidenceIdentities.add(evidenceKey(item.factId, item.ruleId));
    }
  }
  return {
    independentProfileFamilyCount: new Set(
      candidates.flatMap((candidate) => candidate.independentProfileFamilyIds),
    ).size,
    rootWordBudgets: Object.fromEntries(
      Object.entries(roots).sort(([left], [right]) => compareText(left, right)),
    ),
    selectedClaimCount: candidates.length,
    selectedClaimsByTheme: Object.fromEntries(
      Object.entries(themes).sort(([left], [right]) => compareText(left, right)),
    ),
    selectedEvidenceCount: evidenceIdentities.size,
    timingWordBudget: candidates
      .filter((candidate) => candidate.timing)
      .reduce((total, candidate) => total + candidate.wordBudget, 0),
    totalInterpretiveWordBudget: candidates.reduce(
      (total, candidate) => total + candidate.wordBudget,
      0,
    ),
  };
}

export function stableReportPlan(plan: ReportPlan): string {
  return stableStringify(plan);
}
