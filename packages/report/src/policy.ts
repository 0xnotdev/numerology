import { type AppliedPlannerPolicy, type PlannerPolicy, ReportPlanningError } from "./types";

export const DEFAULT_PLANNER_POLICY = Object.freeze({
  maxActions: 5,
  maxClaimsPerTheme: 3,
  maxRootWordShare: 0.25,
  maxTimingWordShare: 0.2,
  minimumIndependentProfileFamilies: 3,
});

export type EffectivePolicy = AppliedPlannerPolicy;

function isUnitShare(value: number): boolean {
  return Number.isFinite(value) && value > 0 && value <= 1;
}

export function resolvePlannerPolicy(policy?: PlannerPolicy): EffectivePolicy {
  const result: EffectivePolicy = {
    maxActions: policy?.maxActions ?? DEFAULT_PLANNER_POLICY.maxActions,
    maxClaimsPerTheme: policy?.maxClaimsPerTheme ?? DEFAULT_PLANNER_POLICY.maxClaimsPerTheme,
    maxRootWordShare: policy?.maxRootWordShare ?? DEFAULT_PLANNER_POLICY.maxRootWordShare,
    maxTimingWordShare: policy?.maxTimingWordShare ?? DEFAULT_PLANNER_POLICY.maxTimingWordShare,
    minimumIndependentProfileFamilies:
      policy?.minimumIndependentProfileFamilies ??
      DEFAULT_PLANNER_POLICY.minimumIndependentProfileFamilies,
  };
  if (
    !Number.isInteger(result.maxActions) ||
    result.maxActions < 0 ||
    !Number.isInteger(result.maxClaimsPerTheme) ||
    result.maxClaimsPerTheme < 0 ||
    !Number.isInteger(result.minimumIndependentProfileFamilies) ||
    result.minimumIndependentProfileFamilies < 0 ||
    !isUnitShare(result.maxRootWordShare) ||
    !isUnitShare(result.maxTimingWordShare)
  ) {
    throw new ReportPlanningError("PLANNER_POLICY_INVALID");
  }
  return result;
}
