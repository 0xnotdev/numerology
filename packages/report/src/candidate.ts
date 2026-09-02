import type {
  ReportSectionKey,
  ResolvedEvidence,
  ResolvedSourceReference,
  RuleId,
  SourceId,
  ActionId,
  ClaimClass,
  ReviewState,
  RuleConfidence,
  RuleType,
} from "@numerology/doctrine";
import type { FactId, ProfileId } from "@numerology/engine";
import type { ReportClaimId } from "./ids";
import type { ClaimRelationship, ClaimValence, FactLink } from "./types";

export interface ClaimCandidate {
  readonly actionIds: readonly ActionId[];
  readonly allowedDisplayNumbers: readonly string[];
  readonly claimClass: ClaimClass;
  readonly claimId: ReportClaimId;
  readonly confidence: RuleConfidence;
  readonly contradictionIds: readonly string[];
  readonly contradictionResolutions: readonly string[];
  readonly contentHashes: readonly string[];
  readonly evidence: readonly ResolvedEvidence[];
  readonly factIds: readonly FactId[];
  readonly factLinks: readonly FactLink[];
  readonly independentProfileFamilyIds: readonly string[];
  readonly mandatory: boolean;
  readonly primaryRoot: number | null;
  readonly profileIds: readonly ProfileId[];
  readonly prohibitedPhrases: readonly string[];
  readonly relationship: ClaimRelationship;
  readonly reviewers: readonly string[];
  readonly reviewState: ReviewState;
  readonly ruleIds: readonly RuleId[];
  readonly ruleTypes: readonly RuleType[];
  readonly ruleVersions: readonly string[];
  readonly safetyTags: readonly string[];
  readonly score: number;
  readonly sectionKey: ReportSectionKey;
  readonly sourceIds: readonly SourceId[];
  readonly sourceReferences: readonly ResolvedSourceReference[];
  readonly text: string;
  readonly themeId: string;
  readonly timing: boolean;
  readonly valence: ClaimValence;
  readonly wordBudget: number;
}

export function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function uniqueSorted<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort(compareText);
}

export function candidateRank(left: ClaimCandidate, right: ClaimCandidate): number {
  return (
    right.score - left.score ||
    Number(right.mandatory) - Number(left.mandatory) ||
    compareText(left.themeId, right.themeId) ||
    compareText(left.ruleIds.join("\u0000"), right.ruleIds.join("\u0000")) ||
    compareText(left.factIds.join("\u0000"), right.factIds.join("\u0000")) ||
    compareText(left.text, right.text) ||
    compareText(left.claimId, right.claimId)
  );
}
