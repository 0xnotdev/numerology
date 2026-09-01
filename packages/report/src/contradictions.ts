import {
  doctrineProfileMethod,
  type DoctrineContradiction,
  type ResolvedEvidence,
  type RuleConfidence,
} from "@numerology/doctrine";
import { canonicalHash, type CalculatedFact, type FactId } from "@numerology/engine";
import { candidateRank, compareText, type ClaimCandidate, uniqueSorted } from "./candidate";
import { uniqueSourceReferences } from "./ranking";

const CONFIDENCE_RANK: Readonly<Record<RuleConfidence, number>> = Object.freeze({
  high: 0,
  low: 2,
  medium: 1,
  unresolved: 3,
});

function weakestConfidence(evidence: readonly ResolvedEvidence[]): RuleConfidence {
  return (
    [...evidence].sort(
      (left, right) =>
        CONFIDENCE_RANK[right.confidence] - CONFIDENCE_RANK[left.confidence] ||
        compareText(left.ruleId, right.ruleId),
    )[0]?.confidence ?? "unresolved"
  );
}

function warningEvidence(
  warning: DoctrineContradiction,
  evidence: readonly ResolvedEvidence[],
): ResolvedEvidence[] {
  const left = evidence.filter((item) => item.profileId === warning.profile_a);
  const right = evidence.filter((item) => item.profileId === warning.profile_b);
  if (left.length === 0 || right.length === 0) {
    return [];
  }
  const byIdentity = new Map(
    [...left, ...right].map((item) => [`${item.factId}\u0000${item.ruleId}`, item]),
  );
  return [...byIdentity.values()].sort(
    (first, second) =>
      compareText(first.ruleId, second.ruleId) || compareText(first.factId, second.factId),
  );
}

/** Converts doctrine-authored boundary warnings into mandatory, fully sourced plan claims. */
export function buildContradictionCandidates(
  warnings: readonly DoctrineContradiction[],
  evidence: readonly ResolvedEvidence[],
  factsById: ReadonlyMap<FactId, CalculatedFact>,
): ClaimCandidate[] {
  const result: ClaimCandidate[] = [];
  for (const warning of [...warnings].sort((left, right) =>
    compareText(left.contradiction_id, right.contradiction_id),
  )) {
    const support = warningEvidence(warning, evidence);
    if (support.length === 0) {
      continue;
    }
    const facts = support.flatMap((item) => {
      const fact = factsById.get(item.factId);
      return fact === undefined ? [] : [fact];
    });
    const sourceReferences = uniqueSourceReferences(
      support.flatMap((item) => item.sourceReferences),
    );
    result.push({
      actionIds: [],
      allowedDisplayNumbers: uniqueSorted(facts.flatMap((fact) => fact.displayTokens)),
      claimClass: "G",
      claimId: `claim.contradiction.${canonicalHash(warning).slice(7, 31)}`,
      confidence: weakestConfidence(support),
      contradictionIds: [warning.contradiction_id],
      contradictionResolutions: [warning.resolution],
      contentHashes: uniqueSorted(support.map((item) => item.contentHash)),
      evidence: support,
      factIds: uniqueSorted(facts.map((fact) => fact.factId)),
      factLinks: facts
        .map((fact) => ({
          factId: fact.factId,
          profileId: fact.profileId,
          traceIds: uniqueSorted(fact.traceIds),
        }))
        .sort((left, right) => compareText(left.factId, right.factId)),
      independentProfileFamilyIds: uniqueSorted(
        facts.map((fact) => doctrineProfileMethod(fact.profileId).familyId),
      ),
      mandatory: true,
      primaryRoot: null,
      profileIds: uniqueSorted(facts.map((fact) => fact.profileId)),
      prohibitedPhrases: uniqueSorted(support.flatMap((item) => item.prohibitedPhrases)),
      relationship: "contradiction",
      reviewers: uniqueSorted(support.flatMap((item) => item.reviewers)),
      reviewState: "approved",
      ruleIds: uniqueSorted(support.map((item) => item.ruleId)),
      ruleTypes: uniqueSorted(support.map((item) => item.ruleType)),
      ruleVersions: uniqueSorted(support.map((item) => item.ruleVersion)),
      safetyTags: uniqueSorted(support.flatMap((item) => item.safetyTags)),
      score: 0,
      sectionKey: "methodology_appendix",
      sourceIds: uniqueSorted(sourceReferences.map((reference) => reference.sourceId)),
      sourceReferences,
      text: `${warning.dimension}: ${warning.position_a} versus ${warning.position_b}. Resolution: ${warning.resolution}.`,
      themeId: `contradiction.${warning.contradiction_id}`,
      timing: false,
      valence: "contextual",
      // Mandatory audit warnings are rendered from the appendix reservation, not optional prose budget.
      wordBudget: 0,
    });
  }
  return result.sort(candidateRank);
}
