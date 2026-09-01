import type {
  ActionId,
  ResolvedEvidence,
  ResolvedEvidenceBundle,
  RuleId,
  SourceId,
} from "@numerology/doctrine";
import type { FactId } from "@numerology/engine";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { planReport } from "./planner";
import { buildIntegrationFixture } from "./test-support";

type PlannerEvidenceParameter = Parameters<typeof planReport>[1];
type RequiredEvidenceFields = Pick<
  ResolvedEvidence,
  | "actionIds"
  | "actions"
  | "calculationTraceIds"
  | "claimClass"
  | "claims"
  | "confidence"
  | "contentHash"
  | "factId"
  | "metricId"
  | "profileId"
  | "reviewState"
  | "ruleId"
  | "ruleType"
  | "ruleVersion"
  | "safetyTags"
  | "sectionKey"
  | "sourceIds"
  | "sourceReferences"
  | "status"
  | "suppressesRuleIds"
  | "themes"
>;

function contractIdentity(item: RequiredEvidenceFields) {
  return {
    actionIds: item.actionIds,
    calculationTraceIds: item.calculationTraceIds,
    claimClass: item.claimClass,
    claims: item.claims,
    factId: item.factId,
    reviewState: item.reviewState,
    ruleId: item.ruleId,
    safetyTags: item.safetyTags,
    sectionKey: item.sectionKey,
    sourceIds: item.sourceIds,
    sourceReferences: item.sourceReferences,
    suppressesRuleIds: item.suppressesRuleIds,
    themes: item.themes,
  };
}

describe("compile-time doctrine/report contract", () => {
  it("uses doctrine's export as the exact planner parameter and preserves branded IDs", () => {
    expectTypeOf<PlannerEvidenceParameter>().toEqualTypeOf<ResolvedEvidenceBundle>();
    expectTypeOf<ResolvedEvidence["factId"]>().toEqualTypeOf<FactId>();
    expectTypeOf<ResolvedEvidence["ruleId"]>().toEqualTypeOf<RuleId>();
    expectTypeOf<ResolvedEvidence["sourceIds"][number]>().toEqualTypeOf<SourceId>();
    expectTypeOf<ResolvedEvidence["actionIds"][number]>().toEqualTypeOf<ActionId>();

    const fixture = buildIntegrationFixture();
    const first = fixture.evidence.evidence[0];
    if (first === undefined) {
      throw new Error("Missing contract evidence.");
    }
    const identity = contractIdentity(first);
    expect(identity.factId).toBe(first.factId);
    expect(identity.sourceReferences).toBe(first.sourceReferences);
  });
});
