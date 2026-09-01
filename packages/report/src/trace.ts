import type {
  DoctrineContradiction,
  DoctrineOmission,
  DoctrineSuppression,
  EvidenceReproducibility,
  EvidenceResolutionTrace,
  ResolvedEvidenceBundle,
} from "@numerology/doctrine";

export interface PlanDoctrineAudit {
  readonly boundaryWarnings: readonly DoctrineContradiction[];
  readonly evidenceResolutionHash: string;
  readonly omissions: readonly DoctrineOmission[];
  readonly reproducibility: EvidenceReproducibility;
  readonly resolutionTraces: readonly EvidenceResolutionTrace[];
  readonly suppressions: readonly DoctrineSuppression[];
}

/** Owns lossless doctrine audit propagation; references remain the registry's frozen values. */
export function doctrineAuditForPlan(evidence: ResolvedEvidenceBundle): PlanDoctrineAudit {
  return {
    boundaryWarnings: evidence.boundaryWarnings,
    evidenceResolutionHash: evidence.resolutionHash,
    omissions: evidence.omissions,
    reproducibility: evidence.reproducibility,
    resolutionTraces: evidence.traces,
    suppressions: evidence.suppressions,
  };
}
