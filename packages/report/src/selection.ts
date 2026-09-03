import { EDITORIAL_SECTIONS, type ReportSectionKey } from "@numerology/doctrine";
import { type ClaimCandidate, candidateRank } from "./candidate";
import type { EffectivePolicy } from "./policy";
import { balanceClaimValence, enforceThemeClaimCap } from "./ranking";

const SECTION_BUDGETS = new Map(
  EDITORIAL_SECTIONS.map((section) => [section.key, section.wordBudget]),
);

function sectionLimit(sectionKey: ReportSectionKey): number {
  /* c8 ignore next -- doctrine's typed section key is exhaustive. */
  return SECTION_BUDGETS.get(sectionKey) ?? 0;
}

function selectUnderSectionBudgets(
  candidates: readonly ClaimCandidate[],
  mandatory: readonly ClaimCandidate[],
): ClaimCandidate[] {
  const selected = [...mandatory];
  const used = new Map<ReportSectionKey, number>();
  for (const candidate of mandatory) {
    used.set(candidate.sectionKey, (used.get(candidate.sectionKey) ?? 0) + candidate.wordBudget);
  }
  for (const candidate of [...candidates].sort(candidateRank)) {
    const sectionWords = used.get(candidate.sectionKey) ?? 0;
    if (sectionWords + candidate.wordBudget <= sectionLimit(candidate.sectionKey)) {
      selected.push(candidate);
      used.set(candidate.sectionKey, sectionWords + candidate.wordBudget);
    }
  }
  return selected;
}

function totalWords(candidates: readonly ClaimCandidate[]): number {
  return candidates.reduce((total, candidate) => total + candidate.wordBudget, 0);
}

function removeLowestRanked(
  candidates: readonly ClaimCandidate[],
  removable: readonly ClaimCandidate[],
): ClaimCandidate[] {
  const removed = removable.at(-1);
  return removed === undefined
    ? [...candidates]
    : candidates.filter((candidate) => candidate.claimId !== removed.claimId);
}

function enforceTimingShare(
  candidates: readonly ClaimCandidate[],
  maxTimingWordShare: number,
): ClaimCandidate[] {
  let selected = [...candidates];
  while (selected.length > 0) {
    const timing = selected.filter((candidate) => candidate.timing);
    const timingWords = totalWords(timing);
    if (timingWords / totalWords(selected) <= maxTimingWordShare) {
      break;
    }
    const next = removeLowestRanked(
      selected,
      timing.filter((candidate) => !candidate.mandatory),
    );
    if (next.length === selected.length) {
      break;
    }
    selected = next;
  }
  return selected;
}

function enforceRootShare(
  candidates: readonly ClaimCandidate[],
  maxRootWordShare: number,
): ClaimCandidate[] {
  let selected = [...candidates];
  while (selected.length > 0) {
    const roots = new Map<number, ClaimCandidate[]>();
    for (const candidate of selected) {
      if (candidate.primaryRoot !== null) {
        const group = roots.get(candidate.primaryRoot) ?? [];
        group.push(candidate);
        roots.set(candidate.primaryRoot, group);
      }
    }
    const overrepresented = [...roots.entries()]
      .map(([root, group]) => ({ root, group, words: totalWords(group) }))
      .filter(({ words }) => words / totalWords(selected) > maxRootWordShare)
      .sort((left, right) => right.words - left.words || left.root - right.root)[0];
    if (overrepresented === undefined) {
      break;
    }
    const next = removeLowestRanked(
      selected,
      overrepresented.group.filter((candidate) => !candidate.mandatory),
    );
    if (next.length === selected.length) {
      break;
    }
    selected = next;
  }
  return selected;
}

function enforceTensionActionCapacity(
  candidates: readonly ClaimCandidate[],
  maxActions: number,
): ClaimCandidate[] {
  const reservedActions = new Set<string>();
  return candidates.filter((candidate) => {
    if (candidate.valence !== "tension") {
      return true;
    }
    const newActions = candidate.actionIds.filter((actionId) => !reservedActions.has(actionId));
    if (reservedActions.size + newActions.length > maxActions) {
      return false;
    }
    for (const actionId of newActions) {
      reservedActions.add(actionId);
    }
    return true;
  });
}

/** Owns all optional-claim repetition, section, valence, action, timing, and root constraints. */
export function selectClaims(
  optional: readonly ClaimCandidate[],
  mandatory: readonly ClaimCandidate[],
  policy: EffectivePolicy,
): ClaimCandidate[] {
  const themeLimited = enforceThemeClaimCap(optional, policy.maxClaimsPerTheme);
  const valenceBalanced = balanceClaimValence(themeLimited);
  const actionBounded = enforceTensionActionCapacity(valenceBalanced, policy.maxActions);
  let balanced = selectUnderSectionBudgets(actionBounded, mandatory);
  // Root and timing caps share one denominator. Removing a root-heavy claim can expose a timing
  // overflow (and vice versa), so converge both limits rather than validating only one pass.
  while (balanced.length > 0) {
    const next = enforceRootShare(
      enforceTimingShare(balanced, policy.maxTimingWordShare),
      policy.maxRootWordShare,
    );
    if (next.length === balanced.length) break;
    balanced = next;
  }
  return balanced.sort(candidateRank);
}
