import type { ResolvedEvidenceBundle } from "@numerology/doctrine";
import { canonicalHash, type CalculationBundle } from "@numerology/engine";
import { deepFreeze } from "@numerology/shared";
import { buildPlannedActions } from "./actions";
import { buildContradictionCandidates } from "./contradictions";
import { assertResolvedEvidenceBoundary } from "./evidence";
import { resolvePlannerPolicy } from "./policy";
import { buildClaimCandidates } from "./ranking";
import { selectClaims } from "./selection";
import { buildSections, profileMethodsForBundle } from "./sections";
import { planStatistics, toPlannedClaims } from "./serialization";
import { doctrineAuditForPlan } from "./trace";
import {
  REPORT_PLAN_SCHEMA_VERSION,
  REPORT_PLANNER_VERSION,
  ReportPlanningError,
  type PlannerPolicy,
  type ReportPlan,
} from "./types";
import { validateReportPlan } from "./validation";

const MANDATORY_RESERVATIONS = [
  "core_overview",
  "school_disagreement",
  "actions",
  "safety_note",
  "methodology_appendix",
] as const;

/**
 * Pure deterministic planning over the engine's parsed bundle and doctrine's sole exported resolved
 * evidence contract. No adapter, evidence reshaping layer, I/O, database, framework, or model exists
 * on this path.
 */
export function planReport(
  bundle: CalculationBundle,
  resolvedEvidence: ResolvedEvidenceBundle,
  requestedPolicy?: PlannerPolicy,
): ReportPlan {
  const policy = resolvePlannerPolicy(requestedPolicy);
  const context = assertResolvedEvidenceBoundary(bundle, resolvedEvidence);
  const optional = buildClaimCandidates(resolvedEvidence.evidence, context.factsById);
  const mandatory = buildContradictionCandidates(
    resolvedEvidence.boundaryWarnings,
    resolvedEvidence.evidence,
    context.factsById,
  );
  const selected = selectClaims(optional, mandatory, policy);
  const statistics = planStatistics(selected);
  if (statistics.independentProfileFamilyCount < policy.minimumIndependentProfileFamilies) {
    throw new ReportPlanningError("INSUFFICIENT_INDEPENDENT_PROFILE_FAMILIES");
  }

  const audit = doctrineAuditForPlan(resolvedEvidence);
  const planWithoutHash = {
    actions: buildPlannedActions(selected, policy.maxActions),
    boundaryWarnings: audit.boundaryWarnings,
    claims: toPlannedClaims(selected),
    evidenceResolutionHash: audit.evidenceResolutionHash,
    omissions: audit.omissions,
    plannerVersion: REPORT_PLANNER_VERSION,
    policy,
    profileMethods: profileMethodsForBundle(bundle),
    reproducibility: audit.reproducibility,
    reservations: MANDATORY_RESERVATIONS,
    resolutionTraces: audit.resolutionTraces,
    schemaVersion: REPORT_PLAN_SCHEMA_VERSION,
    sections: buildSections(selected, bundle.facts),
    statistics,
    suppressions: audit.suppressions,
  } as const;
  const plan: ReportPlan = {
    ...planWithoutHash,
    planHash: canonicalHash(planWithoutHash),
  };
  const validation = validateReportPlan(plan, requestedPolicy);
  if (!validation.valid) {
    throw new ReportPlanningError(validation.diagnostics[0] ?? "PLAN_VALIDATION_FAILED");
  }
  return deepFreeze(plan);
}
