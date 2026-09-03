import type { ActionId, ResolvedAction } from "@numerology/doctrine";
import { type ClaimCandidate, compareText, uniqueSorted } from "./candidate";
import { uniqueSourceReferences } from "./ranking";
import { type PlannedAction, ReportPlanningError } from "./types";

interface ActionClaims {
  readonly action: ResolvedAction;
  readonly claims: ClaimCandidate[];
}

/** Allocates resolved doctrine actions to selected claims without changing instructions or IDs. */
export function buildPlannedActions(
  claims: readonly ClaimCandidate[],
  maxActions: number,
): PlannedAction[] {
  const byAction = new Map<ActionId, ActionClaims>();
  for (const claim of claims) {
    const resolvedActions = claim.evidence.flatMap((item) => item.actions);
    for (const actionId of claim.actionIds) {
      const action = resolvedActions.find((item) => item.actionId === actionId);
      if (action === undefined) {
        throw new ReportPlanningError("PLAN_ACTION_REFERENCE_MISSING");
      }
      const prior = byAction.get(actionId);
      if (prior === undefined) {
        byAction.set(actionId, { action, claims: [claim] });
      } else {
        prior.claims.push(claim);
      }
    }
  }

  return [...byAction.values()]
    .sort((left, right) => {
      const leftSupportsTension = left.claims.some((claim) => claim.valence === "tension");
      const rightSupportsTension = right.claims.some((claim) => claim.valence === "tension");
      return (
        Number(rightSupportsTension) - Number(leftSupportsTension) ||
        compareText(left.action.actionId, right.action.actionId)
      );
    })
    .slice(0, maxActions)
    .map(({ action, claims: actionClaims }) => {
      const sourceReferences = uniqueSourceReferences(
        actionClaims.flatMap((claim) => claim.sourceReferences),
      );
      return {
        actionId: action.actionId,
        classification: action.classification,
        claimIds: actionClaims.map((claim) => claim.claimId).sort(compareText),
        instructions: action.instructions,
        ruleIds: uniqueSorted(actionClaims.flatMap((claim) => claim.ruleIds)),
        ruleTypes: uniqueSorted(actionClaims.flatMap((claim) => claim.ruleTypes)),
        safetyTags: action.safetyTags,
        sourceIds: uniqueSorted(sourceReferences.map((reference) => reference.sourceId)),
        sourceReferences,
        version: action.version,
      };
    });
}
