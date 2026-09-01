import type { PlannedClaim, ReportPlan } from "./types";

function claimLine(claim: PlannedClaim): string {
  const sources = claim.sourceReferences
    .map((source) => `${source.sourceId} (${source.locator})`)
    .join(", ");
  return `- **${claim.themeId}** — ${claim.text}\n  - Facts: ${claim.factIds.join(", ")} · Rules: ${claim.ruleIds.join(", ")} · Sources: ${sources}`;
}

/** Deterministic reviewer-facing Markdown for a synthetic plan. */
export function renderReportPlan(plan: ReportPlan): string {
  const lines = [
    "# Synthetic report plan",
    "",
    `- Plan hash: \`${plan.planHash}\``,
    `- Evidence resolution: \`${plan.evidenceResolutionHash}\``,
    `- Doctrine release: \`${plan.reproducibility.doctrineReleaseId}\``,
    `- Doctrine hash: \`${plan.reproducibility.doctrineReleaseHash}\``,
    `- Engine: \`${plan.reproducibility.engineVersion}\``,
    `- Input hash: \`${plan.reproducibility.inputHash}\``,
    `- Locale/as-of: \`${plan.reproducibility.locale}\` / \`${plan.reproducibility.asOfDate}\``,
    `- Policy: max ${plan.policy.maxClaimsPerTheme} claims/theme, ${plan.policy.maxActions} actions, root share ${plan.policy.maxRootWordShare}, timing share ${plan.policy.maxTimingWordShare}, ${plan.policy.minimumIndependentProfileFamilies} independent families`,
    "",
    `Selected ${plan.statistics.selectedClaimCount} claims from ${plan.statistics.selectedEvidenceCount} evidence records.`,
    "",
  ];

  if (plan.suppressions.length > 0) {
    lines.push("## Suppressions", "");
    for (const suppression of plan.suppressions) {
      lines.push(
        `- ${suppression.suppressingRuleId} suppressed ${suppression.suppressedRuleId} (${suppression.suppressedFactId}).`,
      );
    }
    lines.push("");
  }

  lines.push("## Sections", "");
  for (const section of plan.sections) {
    const claims = plan.claims.filter((claim) => claim.sectionKey === section.key);
    lines.push(`### ${section.order}. ${section.label}`);
    if (claims.length === 0) {
      lines.push("- _Reserved; no interpretive claim selected._");
    } else {
      lines.push(...claims.map(claimLine));
    }
    if (section.reservedFactIds.length > 0) {
      lines.push(`- Reserved facts: ${section.reservedFactIds.join(", ")}`);
    }
    lines.push("");
  }

  lines.push("## Actions", "");
  if (plan.actions.length === 0) {
    lines.push("- _No action selected._", "");
  } else {
    for (const action of plan.actions) {
      lines.push(
        `- **${action.actionId}** (${action.version}): ${action.instructions.join(" ")} [claims: ${action.claimIds.join(", ")}]`,
      );
    }
    lines.push("");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}
