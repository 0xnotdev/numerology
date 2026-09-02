import type { ResolvedEvidenceBundle } from "@numerology/doctrine";
import type { CalculatedFact, CalculationBundle, FactId } from "@numerology/engine";
import type { StructuredReport } from "../structured-report";
import type { PlannedClaim, ReportPlan } from "../types";
import { diagnostic, type GateCheck } from "./diagnostics";
import { allowedNumericTokens, numericTokens, reportTextSpans } from "./text";

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function planClaims(plan: ReportPlan): ReadonlyMap<string, PlannedClaim> {
  return new Map(plan.claims.map((claim) => [claim.claimId, claim]));
}

export function checkNumeric(report: StructuredReport, plan: ReportPlan): GateCheck {
  const planned = planClaims(plan);
  const diagnostics = [];
  let checkedCount = 0;
  for (const span of reportTextSpans(report)) {
    const occurrences = numericTokens(span.text);
    checkedCount += occurrences.length;
    const allowed = allowedNumericTokens(
      span.claimId === undefined ? [] : (planned.get(span.claimId)?.allowedDisplayNumbers ?? []),
    );
    if (occurrences.some((token) => !allowed.has(token))) {
      diagnostics.push(
        diagnostic("numeric", "REPORT_NUMBER_NOT_ALLOWED", {
          ...(span.claimId === undefined ? {} : { claimId: span.claimId }),
          path: span.path,
          ...(span.sectionId === undefined ? {} : { sectionId: span.sectionId }),
        }),
      );
    }
  }
  return { checkedCount, diagnostics };
}

function blockFactIds(
  report: StructuredReport,
): readonly { readonly factId: FactId; readonly path: string }[] {
  return report.sections.flatMap((section, sectionIndex) =>
    section.blocks.flatMap((block, blockIndex) => {
      const path = `sections.${sectionIndex}.blocks.${blockIndex}`;
      switch (block.type) {
        case "number_card":
          return [{ factId: block.factId, path: `${path}.factId` }];
        case "comparison":
          return [
            { factId: block.leftFactId, path: `${path}.leftFactId` },
            { factId: block.rightFactId, path: `${path}.rightFactId` },
          ];
        case "lo_shu":
          return [{ factId: block.gridFactId, path: `${path}.gridFactId` }];
        case "timeline":
          return block.items.map((item, itemIndex) => ({
            factId: item.factId,
            path: `${path}.items.${itemIndex}.factId`,
          }));
        default:
          return [];
      }
    }),
  );
}

export function checkFactLinkage(
  report: StructuredReport,
  bundle: CalculationBundle,
  plan: ReportPlan,
): GateCheck {
  const facts = new Map(bundle.facts.map((fact) => [fact.factId, fact]));
  const traces = new Set(bundle.traces.map((trace) => trace.traceId));
  const reservedFacts = new Set(plan.sections.flatMap((section) => section.reservedFactIds));
  const planned = planClaims(plan);
  const reportClaimIds = new Set(report.claims.map((claim) => claim.claimId));
  const diagnostics = [];
  let checkedCount = 0;
  for (const claim of report.claims) {
    checkedCount += claim.factIds.length;
    const expected = planned.get(claim.claimId);
    if (expected === undefined || !sameStrings(claim.factIds, expected.factIds)) {
      diagnostics.push(
        diagnostic("fact_linkage", "REPORT_CLAIM_FACT_LINK_MISMATCH", {
          claimId: claim.claimId,
        }),
      );
    }
    const expectedTraceIds =
      expected === undefined
        ? []
        : [...new Set(expected.factLinks.flatMap((link) => link.traceIds))].sort();
    if (!sameStrings(claim.traceIds, expectedTraceIds)) {
      diagnostics.push(
        diagnostic("fact_linkage", "REPORT_CLAIM_TRACE_LINK_MISMATCH", {
          claimId: claim.claimId,
        }),
      );
    }
    const expectedKind =
      expected === undefined
        ? undefined
        : expected.relationship === "contradiction" || expected.valence === "tension"
          ? "tension"
          : "finding";
    if (
      expected !== undefined &&
      (claim.themeId !== expected.themeId ||
        claim.confidence !== (expected.confidence === "unresolved" ? "low" : expected.confidence) ||
        claim.kind !== expectedKind ||
        claim.displayNumbers.some((token) => !expected.allowedDisplayNumbers.includes(token)))
    ) {
      diagnostics.push(
        diagnostic("fact_linkage", "REPORT_CLAIM_METADATA_MISMATCH", {
          claimId: claim.claimId,
        }),
      );
    }
    for (const factId of claim.factIds) {
      if (!facts.has(factId)) {
        diagnostics.push(
          diagnostic("fact_linkage", "REPORT_FACT_UNKNOWN", { claimId: claim.claimId, factId }),
        );
      }
    }
    for (const traceId of claim.traceIds) {
      if (!traces.has(traceId)) {
        diagnostics.push(
          diagnostic("fact_linkage", "REPORT_TRACE_UNKNOWN", {
            claimId: claim.claimId,
            path: "traceIds",
          }),
        );
      }
    }
  }
  for (const reference of blockFactIds(report)) {
    checkedCount += 1;
    if (!facts.has(reference.factId)) {
      diagnostics.push(
        diagnostic("fact_linkage", "REPORT_BLOCK_FACT_UNKNOWN", {
          factId: reference.factId,
          path: reference.path,
        }),
      );
    } else if (!reservedFacts.has(reference.factId)) {
      diagnostics.push(
        diagnostic("fact_linkage", "REPORT_BLOCK_FACT_NOT_RESERVED", {
          factId: reference.factId,
          path: reference.path,
        }),
      );
    }
  }
  report.sections.forEach((section, sectionIndex) => {
    section.blocks.forEach((block, blockIndex) => {
      if (block.type !== "timeline") {
        return;
      }
      block.items.forEach((item, itemIndex) => {
        checkedCount += 1;
        if (!reportClaimIds.has(item.claimId)) {
          diagnostics.push(
            diagnostic("fact_linkage", "REPORT_TIMELINE_CLAIM_UNKNOWN", {
              claimId: item.claimId,
              path: `sections.${sectionIndex}.blocks.${blockIndex}.items.${itemIndex}.claimId`,
              sectionId: section.sectionId,
            }),
          );
        }
      });
    });
  });
  return { checkedCount, diagnostics };
}

function evidenceSupports(
  evidence: ResolvedEvidenceBundle,
  claim: StructuredReport["claims"][number],
): boolean {
  return claim.ruleIds.every((ruleId) =>
    evidence.evidence.some(
      (item) =>
        item.ruleId === ruleId &&
        claim.factIds.includes(item.factId) &&
        item.sourceIds.some((sourceId) => claim.sourceRefs.includes(sourceId)) &&
        item.status === "active" &&
        item.reviewState === "approved",
    ),
  );
}

export function checkRuleSource(
  report: StructuredReport,
  evidence: ResolvedEvidenceBundle,
  plan: ReportPlan,
): GateCheck {
  const planned = planClaims(plan);
  const diagnostics = [];
  let checkedCount = 0;
  for (const claim of report.claims) {
    checkedCount += claim.ruleIds.length + claim.sourceRefs.length + 1;
    const expected = planned.get(claim.claimId);
    if (
      expected === undefined ||
      !sameStrings(claim.ruleIds, expected.ruleIds) ||
      !sameStrings(claim.sourceRefs, expected.sourceIds)
    ) {
      diagnostics.push(
        diagnostic("rule_source", "REPORT_CLAIM_RULE_SOURCE_MISMATCH", {
          claimId: claim.claimId,
        }),
      );
    }
    if (expected === undefined || claim.semanticSummary !== expected.text) {
      diagnostics.push(
        diagnostic("rule_source", "REPORT_CLAIM_SEMANTIC_MISMATCH", {
          claimId: claim.claimId,
        }),
      );
    }
    if (!evidenceSupports(evidence, claim)) {
      diagnostics.push(
        diagnostic("rule_source", "REPORT_RULE_SOURCE_UNRESOLVED", {
          claimId: claim.claimId,
          ...(claim.ruleIds[0] === undefined ? {} : { ruleId: claim.ruleIds[0] }),
        }),
      );
    }
  }
  return { checkedCount, diagnostics };
}

function factsForClaim(
  claim: StructuredReport["claims"][number],
  facts: ReadonlyMap<FactId, CalculatedFact>,
): readonly CalculatedFact[] {
  return claim.factIds.flatMap((factId) => {
    const fact = facts.get(factId);
    return fact === undefined ? [] : [fact];
  });
}

export function checkSchoolBoundary(
  report: StructuredReport,
  bundle: CalculationBundle,
  plan: ReportPlan,
): GateCheck {
  const facts = new Map(bundle.facts.map((fact) => [fact.factId, fact]));
  const planned = planClaims(plan);
  const diagnostics = [];
  let checkedCount = 0;
  for (const claim of report.claims) {
    const expectedProfiles = planned.get(claim.claimId)?.profileIds ?? [];
    const actualProfiles = [
      ...new Set(factsForClaim(claim, facts).map((fact) => fact.profileId)),
    ].sort();
    checkedCount += actualProfiles.length;
    if (!sameStrings(actualProfiles, expectedProfiles)) {
      diagnostics.push(
        diagnostic("school_boundary", "REPORT_PROFILE_BOUNDARY_MISMATCH", {
          claimId: claim.claimId,
        }),
      );
    }
  }
  report.sections.forEach((section) => {
    section.blocks.forEach((block) => {
      if (block.type !== "comparison") {
        return;
      }
      checkedCount += 1;
      const left = facts.get(block.leftFactId);
      const right = facts.get(block.rightFactId);
      if (left !== undefined && right !== undefined && left.profileId === right.profileId) {
        diagnostics.push(
          diagnostic("school_boundary", "REPORT_COMPARISON_PROFILE_BLENDED", {
            factId: block.leftFactId,
            sectionId: section.sectionId,
          }),
        );
      }
    });
  });
  return { checkedCount, diagnostics };
}

export function checkContradictions(report: StructuredReport, plan: ReportPlan): GateCheck {
  const reportClaims = new Map(report.claims.map((claim) => [claim.claimId, claim]));
  const contradictions = plan.claims.filter((claim) => claim.relationship === "contradiction");
  const diagnostics = [];
  for (const planned of contradictions) {
    const claim = reportClaims.get(planned.claimId);
    if (
      claim === undefined ||
      claim.kind !== "tension" ||
      !sameStrings(claim.ruleIds, planned.ruleIds) ||
      !sameStrings(claim.factIds, planned.factIds) ||
      !sameStrings(claim.sourceRefs, planned.sourceIds) ||
      !sameStrings(
        claim.traceIds,
        [...new Set(planned.factLinks.flatMap((link) => link.traceIds))].sort(),
      ) ||
      !sameStrings(claim.contradictionIds, planned.contradictionIds) ||
      !claim.localized.body.some((paragraph) => paragraph.includes(planned.text))
    ) {
      diagnostics.push(
        diagnostic("contradiction", "REPORT_CONTRADICTION_UNFRAMED", {
          claimId: planned.claimId,
        }),
      );
    }
  }
  return { checkedCount: contradictions.length, diagnostics };
}
