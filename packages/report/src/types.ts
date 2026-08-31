import type { CalculationBundle, CalculatedFact } from "@numerology/engine";

export const REPORT_PLANNER_VERSION = "plan-1.0.0";
export const REPORT_PLAN_SCHEMA_VERSION = "1.0.0" as const;

export type ClaimClass = "A" | "B" | "C" | "D" | "E" | "F" | "G";
export type EvidenceConfidence = "high" | "medium" | "low" | "unresolved";
export type EvidenceRuleStatus = "draft" | "active" | "deprecated" | "retracted";
export type EvidenceReviewState = "unreviewed" | "in_review" | "approved" | "rejected";
export type EvidenceSourceClass =
  | "primary"
  | "authoritative_practitioner"
  | "derived_product_policy";
export type ThemeOrigin = "authored" | "derived";
export type ClaimRelationship = "convergence" | "unique_signal" | "complement" | "contradiction";
export type ClaimValence = "strength" | "tension" | "contextual" | "neutral";
export type ActionCost = "free" | "low_cost" | "paid";
export type ActionReversibility = "reversible" | "bounded" | "irreversible";
export type ActionSafety = "low_risk" | "high_risk";

export const SECTION_KEYS = [
  "cover_reading_guide",
  "input_methods",
  "core_overview",
  "life_path",
  "birthday_psychic_comparison",
  "western_name_layers",
  "current_name_comparison",
  "name_change_comparison",
  "lo_shu_raw_grid",
  "lo_shu_augmented_comparison",
  "repeated_strengths",
  "growth_edges",
  "work_money",
  "relationships",
  "personal_year",
  "personal_months",
  "actions",
  "methodology_appendix",
] as const;

export type ReportSectionKey = (typeof SECTION_KEYS)[number];

export interface SourceLink {
  readonly evidenceClass: EvidenceSourceClass;
  readonly locator: string;
  readonly sourceId: string;
}

export interface ProfileDescriptor {
  /** A family is the independence unit; sibling formula variants must share it. */
  readonly familyId: string;
  readonly methodLabel: string;
  readonly profileId: string;
}

export interface ThemeDefinition {
  readonly complementThemeIds: readonly string[];
  /** Doctrine authors define themes; the planner marks generated relationships as derived. */
  readonly origin: ThemeOrigin;
  readonly themeId: string;
  readonly tensionThemeIds: readonly string[];
}

/**
 * Output of the future DoctrineRegistry.resolve seam. Conditions have already been evaluated against
 * the calculation bundle; this package neither reads doctrine files nor interprets rule conditions.
 */
export interface ResolvedDoctrineRule {
  readonly actionKeys: readonly string[];
  readonly claimClass: ClaimClass;
  readonly confidence: EvidenceConfidence;
  readonly exclusions: readonly string[];
  readonly factId: string;
  readonly profileId: string;
  readonly reviewState: EvidenceReviewState;
  readonly ruleId: string;
  readonly ruleVersion: string;
  readonly safetyTags: readonly string[];
  readonly sectionKey: ReportSectionKey;
  readonly sourceRefIds: readonly string[];
  readonly status: EvidenceRuleStatus;
  readonly themeIds: readonly string[];
  readonly timeRelevance?: "current" | "historical" | "none";
  readonly valence: ClaimValence;
}

export interface ResolvedContradiction {
  readonly contradictionId: string;
  readonly factIds: readonly string[];
  readonly profileIds: readonly string[];
  /** Retains the matrix's policy-specific resolution instead of collapsing disagreement. */
  readonly resolution: string;
  readonly sourceRefIds: readonly string[];
}

export interface ActionDefinition {
  readonly actionKey: string;
  readonly cost: ActionCost;
  readonly reversibility: ActionReversibility;
  readonly safety: ActionSafety;
}

/** Explicit doctrine-worker-to-planner boundary; no database, Next.js, or model is involved. */
export interface ResolvedEvidenceBundle {
  readonly actions: readonly ActionDefinition[];
  readonly contradictions: readonly ResolvedContradiction[];
  readonly doctrineManifestHash: string;
  readonly doctrineVersion: string;
  readonly profileCatalog: readonly ProfileDescriptor[];
  readonly resolvedRules: readonly ResolvedDoctrineRule[];
  readonly schemaVersion: "1.0.0";
  readonly sources: readonly SourceLink[];
  readonly themeOntology: readonly ThemeDefinition[];
}

export interface ReportPlanningInput {
  readonly bundle: CalculationBundle;
  readonly evidence: ResolvedEvidenceBundle;
  readonly schemaVersion: "1.0.0";
}

export interface PlannerPolicy {
  readonly maxActions?: number;
  readonly maxClaimsPerTheme?: number;
  readonly maxRootWordShare?: number;
  readonly maxTimingWordShare?: number;
  readonly minimumIndependentProfileFamilies?: number;
}

export interface FactLink {
  readonly factId: string;
  readonly profileId: string;
  readonly traceIds: readonly string[];
}

export interface PlannedClaim {
  readonly allowedDisplayNumbers: readonly string[];
  readonly claimClass: ClaimClass;
  readonly claimId: string;
  readonly contradictionIds: readonly string[];
  readonly contradictionResolutions: readonly string[];
  readonly factIds: readonly string[];
  readonly factLinks: readonly FactLink[];
  readonly independentProfileFamilyIds: readonly string[];
  readonly origin: ThemeOrigin;
  readonly profileIds: readonly string[];
  readonly relationship: ClaimRelationship;
  readonly ruleIds: readonly string[];
  readonly score: number;
  readonly sectionKey: ReportSectionKey;
  readonly sourceLinks: readonly SourceLink[];
  readonly themeId: string;
  readonly valence: ClaimValence;
  readonly wordBudget: number;
}

export interface PlannedAction {
  readonly actionKey: string;
  readonly cost: "free" | "low_cost";
  readonly claimIds: readonly string[];
  readonly reversibility: "reversible";
  readonly ruleIds: readonly string[];
  readonly sourceLinks: readonly SourceLink[];
}

export interface PlannedSection {
  readonly claimIds: readonly string[];
  /** Deterministic facts held for the renderer even when no interpretive claim is selected. */
  readonly reservedFactIds: readonly string[];
  readonly key: ReportSectionKey;
  readonly order: number;
  readonly reserved: true;
  readonly wordBudget: number;
}

export interface PlanStatistics {
  readonly independentProfileFamilyCount: number;
  readonly rootWordBudgets: Readonly<Record<string, number>>;
  readonly timingWordBudget: number;
  readonly totalInterpretiveWordBudget: number;
}

export interface ReportPlan {
  readonly actions: readonly PlannedAction[];
  readonly claims: readonly PlannedClaim[];
  readonly doctrineManifestHash: string;
  readonly doctrineVersion: string;
  readonly engineVersion: string;
  readonly inputHash: string;
  readonly planHash: string;
  /** Every included profile is carried into the method explanation reservation. */
  readonly profileMethods: readonly ProfileDescriptor[];
  readonly plannerVersion: typeof REPORT_PLANNER_VERSION;
  readonly reservations: readonly (
    | "core_overview"
    | "school_disagreement"
    | "actions"
    | "safety_note"
    | "methodology_appendix"
  )[];
  readonly schemaVersion: typeof REPORT_PLAN_SCHEMA_VERSION;
  readonly sections: readonly PlannedSection[];
  readonly statistics: PlanStatistics;
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

export type FactById = ReadonlyMap<string, CalculatedFact>;
