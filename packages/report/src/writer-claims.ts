import type { SentenceProvenance, StructuredClaim } from "./structured-report";
import type { PlannedAction, PlannedClaim } from "./types";

function headingForTheme(themeId: string): string {
  const heading = themeId
    .replace(/^contradiction\./u, "Method boundary: ")
    .replace(/[._-]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  return `${heading.charAt(0).toUpperCase()}${heading.slice(1)}`;
}

function displayedTokens(text: string, allowed: readonly string[]): readonly string[] {
  return [...new Set(allowed.filter((token) => text.includes(token)))].sort();
}

function sentenceParts(text: string): readonly string[] {
  const parts = text.match(/[^.!?]+[.!?]+/gu)?.map((part) => part.trim()) ?? [];
  return parts.length === 0 ? [text] : parts;
}

function actionForClaim(
  claim: PlannedClaim,
  actions: readonly PlannedAction[],
): string | undefined {
  const instructions = actions
    .filter((action) => action.claimIds.includes(claim.claimId))
    .flatMap((action) => action.instructions);
  return instructions.length === 0 ? undefined : [...new Set(instructions)].sort().join(" ");
}

export function writeClaims(
  claims: readonly PlannedClaim[],
  actions: readonly PlannedAction[],
): readonly StructuredClaim[] {
  return claims.map((claim) => {
    if (claim.confidence === "unresolved") {
      throw new RangeError(`WRITER_UNRESOLVED_CLAIM: ${claim.claimId}`);
    }
    const action = actionForClaim(claim, actions);
    const provenance = (text: string, kind: SentenceProvenance["kind"]): SentenceProvenance => ({
      claimId: claim.claimId,
      factIds: claim.factIds,
      kind,
      ruleIds: claim.ruleIds,
      sourceRefs: claim.sourceIds,
      templateId: kind === "action" ? "action.instructions" : "claim.text",
      text,
    });
    const body = sentenceParts(claim.text);
    return {
      claimId: claim.claimId,
      confidence: claim.confidence,
      contradictionIds: claim.contradictionIds,
      displayNumbers: displayedTokens(claim.text, claim.allowedDisplayNumbers),
      factIds: claim.factIds,
      kind:
        claim.relationship === "contradiction" || claim.valence === "tension"
          ? "tension"
          : "finding",
      localized: {
        ...(action === undefined ? {} : { action, actionProvenance: provenance(action, "action") }),
        body,
        heading: headingForTheme(claim.themeId),
        sentenceProvenance: body.map((text) => provenance(text, "claim")),
      },
      ruleIds: claim.ruleIds,
      salience: Math.max(0, Math.min(100, Math.round(claim.score))),
      semanticSummary: claim.text,
      sourceRefs: claim.sourceIds,
      themeId: claim.themeId,
      traceIds: [...new Set(claim.factLinks.flatMap((link) => link.traceIds))].sort(),
    };
  });
}
