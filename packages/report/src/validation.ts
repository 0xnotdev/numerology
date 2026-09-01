import { EDITORIAL_SECTIONS } from "@numerology/doctrine";
import { canonicalHash } from "@numerology/engine";
import { deepFreeze } from "@numerology/shared";
import { type EffectivePolicy, resolvePlannerPolicy } from "./policy";
import {
  type AppliedPlannerPolicy,
  REPORT_PLAN_SCHEMA_VERSION,
  REPORT_PLANNER_VERSION,
  type PlannerPolicy,
  type PlanValidationResult,
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/u.test(value);
}

function appliedPolicy(value: unknown): AppliedPlannerPolicy | undefined {
  if (
    !isRecord(value) ||
    typeof value.maxActions !== "number" ||
    typeof value.maxClaimsPerTheme !== "number" ||
    typeof value.maxRootWordShare !== "number" ||
    typeof value.maxTimingWordShare !== "number" ||
    typeof value.minimumIndependentProfileFamilies !== "number"
  ) {
    return undefined;
  }
  return {
    maxActions: value.maxActions,
    maxClaimsPerTheme: value.maxClaimsPerTheme,
    maxRootWordShare: value.maxRootWordShare,
    maxTimingWordShare: value.maxTimingWordShare,
    minimumIndependentProfileFamilies: value.minimumIndependentProfileFamilies,
  };
}

function storedPolicyForValidation(
  storedPolicy: AppliedPlannerPolicy | undefined,
  diagnostics: string[],
): EffectivePolicy {
  if (storedPolicy === undefined) {
    return resolvePlannerPolicy();
  }
  try {
    return resolvePlannerPolicy(storedPolicy);
  } catch {
    diagnostics.push("PLAN_POLICY_INVALID");
    return resolvePlannerPolicy();
  }
}

function addClaimDiagnostics(
  claims: readonly unknown[],
  maxClaimsPerTheme: number,
  diagnostics: string[],
): readonly Record<string, unknown>[] {
  const records: Record<string, unknown>[] = [];
  const claimIds = new Set<string>();
  const themeCounts = new Map<string, number>();
  let consecutiveTensions = 0;
  for (const value of claims) {
    if (!isRecord(value)) {
      diagnostics.push("PLAN_CLAIM_INVALID");
      continue;
    }
    records.push(value);
    const claimId = value.claimId;
    if (
      typeof claimId !== "string" ||
      claimIds.has(claimId) ||
      typeof value.text !== "string" ||
      value.text.length === 0 ||
      !isStringArray(value.factIds) ||
      value.factIds.length === 0 ||
      !isStringArray(value.ruleIds) ||
      value.ruleIds.length === 0 ||
      !isStringArray(value.sourceIds) ||
      value.sourceIds.length === 0 ||
      !Array.isArray(value.factLinks) ||
      value.factLinks.length === 0 ||
      value.factLinks.some(
        (link) => !isRecord(link) || !isStringArray(link.traceIds) || link.traceIds.length === 0,
      )
    ) {
      diagnostics.push("PLAN_CLAIM_PROVENANCE");
      continue;
    }
    claimIds.add(claimId);
    if (value.relationship !== "contradiction") {
      const themeId = value.themeId;
      if (typeof themeId !== "string") {
        diagnostics.push("PLAN_CLAIM_INVALID");
      } else {
        themeCounts.set(themeId, (themeCounts.get(themeId) ?? 0) + 1);
      }
    }
    consecutiveTensions = value.valence === "tension" ? consecutiveTensions + 1 : 0;
    if (consecutiveTensions > 2) {
      diagnostics.push("PLAN_NEGATIVE_BALANCE");
    }
  }
  if ([...themeCounts.values()].some((count) => count > maxClaimsPerTheme)) {
    diagnostics.push("PLAN_THEME_CLAIM_LIMIT");
  }
  return records;
}

function addSectionDiagnostics(
  sections: unknown,
  claims: readonly Record<string, unknown>[],
  diagnostics: string[],
): void {
  if (!Array.isArray(sections) || sections.length !== EDITORIAL_SECTIONS.length) {
    diagnostics.push("PLAN_SECTION_CARDINALITY");
    return;
  }
  sections.forEach((value, index) => {
    const expected = EDITORIAL_SECTIONS[index];
    if (
      expected === undefined ||
      !isRecord(value) ||
      value.key !== expected.key ||
      value.label !== expected.label ||
      value.order !== expected.order ||
      value.wordBudget !== expected.wordBudget ||
      value.reserved !== true ||
      !isStringArray(value.claimIds) ||
      !isStringArray(value.reservedFactIds)
    ) {
      diagnostics.push("PLAN_SECTION_ORDER");
      return;
    }
    const claimsInSection = claims.filter((claim) => claim.sectionKey === expected.key);
    const expectedClaimIds = claimsInSection
      .map((claim) => claim.claimId)
      .filter((claimId): claimId is string => typeof claimId === "string")
      .sort();
    if (
      value.claimIds.length !== expectedClaimIds.length ||
      value.claimIds.some((claimId, claimIndex) => claimId !== expectedClaimIds[claimIndex])
    ) {
      diagnostics.push("PLAN_SECTION_CLAIM_LINK");
    }
    const used = claimsInSection.reduce(
      (total, claim) => total + (typeof claim.wordBudget === "number" ? claim.wordBudget : 0),
      0,
    );
    if (used > expected.wordBudget) {
      diagnostics.push("PLAN_SECTION_WORD_BUDGET");
    }
  });
}

function addActionDiagnostics(
  actions: unknown,
  claims: readonly Record<string, unknown>[],
  maxActions: number,
  diagnostics: string[],
): void {
  if (!Array.isArray(actions) || actions.length > maxActions) {
    diagnostics.push("PLAN_ACTION_LIMIT");
    return;
  }
  const actionClaimIds = new Set<string>();
  for (const value of actions) {
    if (
      !isRecord(value) ||
      typeof value.actionId !== "string" ||
      !isStringArray(value.claimIds) ||
      value.claimIds.length === 0 ||
      !isStringArray(value.ruleIds) ||
      value.ruleIds.length === 0 ||
      !isStringArray(value.sourceIds) ||
      value.sourceIds.length === 0 ||
      !isStringArray(value.instructions) ||
      value.instructions.length === 0
    ) {
      diagnostics.push("PLAN_ACTION_INVALID");
      continue;
    }
    value.claimIds.forEach((claimId) => {
      actionClaimIds.add(claimId);
    });
  }
  if (
    claims.some(
      (claim) =>
        claim.valence === "tension" &&
        typeof claim.claimId === "string" &&
        !actionClaimIds.has(claim.claimId),
    )
  ) {
    diagnostics.push("PLAN_TENSION_WITHOUT_ACTION");
  }
}

function addStatisticsDiagnostics(
  statistics: unknown,
  maxRootWordShare: number,
  maxTimingWordShare: number,
  diagnostics: string[],
): void {
  if (
    !isRecord(statistics) ||
    typeof statistics.totalInterpretiveWordBudget !== "number" ||
    statistics.totalInterpretiveWordBudget < 0 ||
    typeof statistics.timingWordBudget !== "number" ||
    !isRecord(statistics.rootWordBudgets)
  ) {
    diagnostics.push("PLAN_STATISTICS_INVALID");
    return;
  }
  const total = statistics.totalInterpretiveWordBudget;
  const timing = statistics.timingWordBudget;
  const roots = Object.values(statistics.rootWordBudgets);
  if (
    roots.some((value) => typeof value !== "number" || value < 0) ||
    (total > 0 && timing / total > maxTimingWordShare) ||
    (total > 0 &&
      Math.max(0, ...roots.filter((value): value is number => typeof value === "number")) / total >
        maxRootWordShare)
  ) {
    diagnostics.push("PLAN_BALANCE_LIMIT");
  }
}

/** Validates a durable plan independently from arithmetic and doctrine resolution. */
export function validateReportPlan(
  plan: unknown,
  requestedPolicy?: PlannerPolicy,
): PlanValidationResult {
  if (!isRecord(plan)) {
    return deepFreeze({ diagnostics: ["PLAN_OBJECT_REQUIRED"], valid: false });
  }
  const diagnostics: string[] = [];
  const storedPolicy = appliedPolicy(plan.policy);
  if (storedPolicy === undefined) {
    diagnostics.push("PLAN_POLICY_INVALID");
  }
  const policy =
    requestedPolicy === undefined
      ? storedPolicyForValidation(storedPolicy, diagnostics)
      : resolvePlannerPolicy(requestedPolicy);
  if (plan.schemaVersion !== REPORT_PLAN_SCHEMA_VERSION) {
    diagnostics.push("PLAN_SCHEMA_VERSION");
  }
  if (plan.plannerVersion !== REPORT_PLANNER_VERSION) {
    diagnostics.push("PLAN_PLANNER_VERSION");
  }
  if (!Array.isArray(plan.claims)) {
    diagnostics.push("PLAN_CLAIMS_REQUIRED");
  }
  const claims = Array.isArray(plan.claims)
    ? addClaimDiagnostics(plan.claims, policy.maxClaimsPerTheme, diagnostics)
    : [];
  addSectionDiagnostics(plan.sections, claims, diagnostics);
  addActionDiagnostics(plan.actions, claims, policy.maxActions, diagnostics);
  addStatisticsDiagnostics(
    plan.statistics,
    policy.maxRootWordShare,
    policy.maxTimingWordShare,
    diagnostics,
  );
  const reservations = Array.isArray(plan.reservations) ? plan.reservations : [];
  if (
    reservations.length === 0 ||
    ![
      "actions",
      "core_overview",
      "methodology_appendix",
      "safety_note",
      "school_disagreement",
    ].every((reservation) => reservations.includes(reservation))
  ) {
    diagnostics.push("PLAN_MANDATORY_RESERVATION");
  }
  if (
    !Array.isArray(plan.profileMethods) ||
    plan.profileMethods.length === 0 ||
    !Array.isArray(plan.resolutionTraces) ||
    !Array.isArray(plan.suppressions) ||
    !Array.isArray(plan.omissions) ||
    !Array.isArray(plan.boundaryWarnings) ||
    !isRecord(plan.reproducibility)
  ) {
    diagnostics.push("PLAN_DOCTRINE_IDENTITY");
  }
  if (!isSha256(plan.planHash)) {
    diagnostics.push("PLAN_HASH_INVALID");
  } else {
    const { planHash: _planHash, ...withoutHash } = plan;
    if (canonicalHash(withoutHash) !== plan.planHash) {
      diagnostics.push("PLAN_HASH_MISMATCH");
    }
  }
  const sorted = [...new Set(diagnostics)].sort();
  return deepFreeze({ diagnostics: sorted, valid: sorted.length === 0 });
}
