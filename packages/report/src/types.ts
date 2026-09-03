import type {
  ActionId,
  ClaimClass,
  DoctrineContradiction,
  DoctrineOmission,
  DoctrineProfileMethod,
  DoctrineSuppression,
  EvidenceReproducibility,
  EvidenceResolutionTrace,
  ReportSectionKey,
  ResolvedSourceReference,
  ReviewState,
  RuleConfidence,
  RuleId,
  RuleType,
  SourceId,
} from "@numerology/doctrine";
import type { FactId, ProfileId } from "@numerology/engine";
import type { ReportClaimId } from "./ids";

export const REPORT_PLANNER_VERSION = "plan-2.0.0";
export const REPORT_PLAN_SCHEMA_VERSION = "1.0.0" as const;

export type ClaimRelationship = "contradiction" | "unique_signal";
export type ClaimValence = "contextual" | "strength" | "tension";

export interface PlannerPolicy {
  readonly maxActions?: number;
  /** Zero intentionally suppresses optional theme claims while retaining mandatory warnings. */
  readonly maxClaimsPerTheme?: number;
  readonly maxRootWordShare?: number;
  readonly maxTimingWordShare?: number;
  readonly minimumIndependentProfileFamilies?: number;
}

export interface AppliedPlannerPolicy {
  readonly maxActions: number;
  readonly maxClaimsPerTheme: number;
  readonly maxRootWordShare: number;
  readonly maxTimingWordShare: number;
  readonly minimumIndependentProfileFamilies: number;
}

export interface FactLink {
  readonly factId: FactId;
  readonly profileId: ProfileId;
  readonly traceIds: readonly string[];
}

export interface PlannedClaim {
  readonly actionIds: readonly ActionId[];
  readonly allowedDisplayNumbers: readonly string[];
  readonly claimClass: ClaimClass;
  readonly claimId: ReportClaimId;
  readonly confidence: RuleConfidence;
  readonly contradictionIds: readonly string[];
  readonly contradictionResolutions: readonly string[];
  readonly contentHashes: readonly string[];
  readonly factIds: readonly FactId[];
  readonly factLinks: readonly FactLink[];
  readonly independentProfileFamilyIds: readonly string[];
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
  readonly valence: ClaimValence;
  readonly wordBudget: number;
}

export interface PlannedAction {
  readonly actionId: ActionId;
  readonly classification?: "practical_alternative" | "traditional_practice";
  readonly claimIds: readonly ReportClaimId[];
  readonly instructions: readonly string[];
  readonly ruleIds: readonly RuleId[];
  readonly ruleTypes?: readonly RuleType[];
  readonly safetyTags: readonly string[];
  readonly sourceIds: readonly SourceId[];
  readonly sourceReferences: readonly ResolvedSourceReference[];
  readonly version: string;
}

export interface PlannedSection {
  readonly claimIds: readonly ReportClaimId[];
  readonly key: ReportSectionKey;
  readonly label: string;
  readonly order: number;
  readonly reserved: true;
  readonly reservedFactIds: readonly FactId[];
  readonly wordBudget: number;
}

export interface PlanStatistics {
  readonly independentProfileFamilyCount: number;
  readonly rootWordBudgets: Readonly<Record<string, number>>;
  readonly selectedClaimCount: number;
  readonly selectedClaimsByTheme: Readonly<Record<string, number>>;
  readonly selectedEvidenceCount: number;
  readonly timingWordBudget: number;
  readonly totalInterpretiveWordBudget: number;
}

export interface ReportPlan {
  readonly actions: readonly PlannedAction[];
  readonly boundaryWarnings: readonly DoctrineContradiction[];
  readonly claims: readonly PlannedClaim[];
  readonly evidenceResolutionHash: string;
  readonly omissions: readonly DoctrineOmission[];
  readonly planHash: string;
  readonly plannerVersion: typeof REPORT_PLANNER_VERSION;
  readonly policy: AppliedPlannerPolicy;
  readonly profileMethods: readonly DoctrineProfileMethod[];
  readonly reproducibility: EvidenceReproducibility;
  readonly reservations: readonly (
    | "actions"
    | "core_overview"
    | "methodology_appendix"
    | "safety_note"
    | "school_disagreement"
  )[];
  readonly resolutionTraces: readonly EvidenceResolutionTrace[];
  readonly schemaVersion: typeof REPORT_PLAN_SCHEMA_VERSION;
  readonly sections: readonly PlannedSection[];
  readonly statistics: PlanStatistics;
  readonly suppressions: readonly DoctrineSuppression[];
}

export interface PlanValidationResult {
  readonly diagnostics: readonly string[];
  readonly valid: boolean;
}

export class ReportPlanningError extends Error {
  public constructor(public readonly code: string) {
    super(code);
    this.name = "ReportPlanningError";
  }
}
