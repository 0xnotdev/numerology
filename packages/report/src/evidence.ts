import {
  REPORT_SECTION_KEYS,
  type ResolvedEvidence,
  type ResolvedEvidenceBundle,
} from "@numerology/doctrine";
import {
  type CalculatedFact,
  type CalculationBundle,
  canonicalHash,
  type FactId,
  validateBundle,
} from "@numerology/engine";
import { uniqueSorted } from "./candidate";
import { ReportPlanningError } from "./types";

export interface EvidenceContext {
  readonly evidenceByKey: ReadonlyMap<string, ResolvedEvidence>;
  readonly factsById: ReadonlyMap<FactId, CalculatedFact>;
}

export function evidenceKey(factId: FactId, ruleId: string): string {
  return `${factId}\u0000${ruleId}`;
}

function sameStrings<T extends string>(left: readonly T[], right: readonly T[]): boolean {
  const normalizedLeft = uniqueSorted(left);
  const normalizedRight = uniqueSorted(right);
  return (
    normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((value, index) => value === normalizedRight[index])
  );
}

function assertReproducibility(bundle: CalculationBundle, resolved: ResolvedEvidenceBundle): void {
  const reproducibility = resolved.reproducibility;
  if (
    reproducibility.calculationBundleHash !== canonicalHash(bundle) ||
    reproducibility.engineVersion !== bundle.engineVersion ||
    reproducibility.formulaManifestHash !== bundle.formulaManifestHash ||
    reproducibility.inputHash !== bundle.inputHash ||
    reproducibility.doctrineSchemaVersion !== resolved.schemaVersion
  ) {
    throw new ReportPlanningError("EVIDENCE_REPRODUCIBILITY_MISMATCH");
  }
  const { resolutionHash: _resolutionHash, ...resolutionContent } = resolved;
  if (canonicalHash(resolutionContent) !== resolved.resolutionHash) {
    throw new ReportPlanningError("EVIDENCE_RESOLUTION_HASH_MISMATCH");
  }
}

function assertEvidenceIdentity(
  item: ResolvedEvidence,
  fact: CalculatedFact,
  traceIds: ReadonlySet<string>,
): void {
  if (
    item.status !== "active" ||
    item.reviewState !== "approved" ||
    item.factId !== fact.factId ||
    item.profileId !== fact.profileId ||
    item.metricId !== fact.metricId ||
    item.claims.length === 0 ||
    item.sourceReferences.length === 0 ||
    !REPORT_SECTION_KEYS.includes(item.sectionKey)
  ) {
    throw new ReportPlanningError("EVIDENCE_IDENTITY_INVALID");
  }
  if (
    !sameStrings(item.calculationTraceIds, fact.traceIds) ||
    item.calculationTraceIds.some((traceId) => !traceIds.has(traceId))
  ) {
    throw new ReportPlanningError("EVIDENCE_TRACE_MISMATCH");
  }
  if (
    !sameStrings(
      item.sourceIds,
      item.sourceReferences.map((reference) => reference.sourceId),
    ) ||
    !sameStrings(
      item.actionIds,
      item.actions.map((action) => action.actionId),
    )
  ) {
    throw new ReportPlanningError("EVIDENCE_REFERENCE_MISMATCH");
  }
}

/**
 * Verifies identity across two already parsed/branded package boundaries. It deliberately does not
 * parse, clone, or adapt doctrine evidence into a report-owned shape.
 */
export function assertResolvedEvidenceBoundary(
  bundle: CalculationBundle,
  resolved: ResolvedEvidenceBundle,
): EvidenceContext {
  if (!validateBundle(bundle).valid) {
    throw new ReportPlanningError("CALCULATION_BUNDLE_INVALID");
  }
  if (resolved.schemaVersion !== "1.0.0") {
    throw new ReportPlanningError("EVIDENCE_SCHEMA_INVALID");
  }
  assertReproducibility(bundle, resolved);

  const factsById = new Map(bundle.facts.map((fact) => [fact.factId, fact]));
  const traceIds = new Set(bundle.traces.map((trace) => trace.traceId));
  const evidenceByKey = new Map<string, ResolvedEvidence>();
  for (const item of resolved.evidence) {
    const key = evidenceKey(item.factId, item.ruleId);
    const fact = factsById.get(item.factId);
    if (fact === undefined) {
      throw new ReportPlanningError("EVIDENCE_FACT_UNKNOWN");
    }
    if (evidenceByKey.has(key)) {
      throw new ReportPlanningError("EVIDENCE_IDENTITY_DUPLICATE");
    }
    assertEvidenceIdentity(item, fact, traceIds);
    evidenceByKey.set(key, item);
  }

  const selectedTraceKeys = new Set(
    resolved.traces
      .filter((trace) => trace.outcome === "selected")
      .map((trace) => evidenceKey(trace.factId, trace.ruleId)),
  );
  if (
    selectedTraceKeys.size !== evidenceByKey.size ||
    [...evidenceByKey.keys()].some((key) => !selectedTraceKeys.has(key))
  ) {
    throw new ReportPlanningError("EVIDENCE_SELECTION_TRACE_MISMATCH");
  }

  for (const suppression of resolved.suppressions) {
    const suppressedKey = evidenceKey(suppression.suppressedFactId, suppression.suppressedRuleId);
    const suppressorKey = evidenceKey(suppression.suppressingFactId, suppression.suppressingRuleId);
    const trace = resolved.traces.find(
      (item) => evidenceKey(item.factId, item.ruleId) === suppressedKey,
    );
    if (
      evidenceByKey.has(suppressedKey) ||
      !evidenceByKey.has(suppressorKey) ||
      trace?.outcome !== "suppressed" ||
      trace.reason !== suppression.suppressingRuleId
    ) {
      throw new ReportPlanningError("EVIDENCE_SUPPRESSION_INVALID");
    }
  }

  return { evidenceByKey, factsById };
}
