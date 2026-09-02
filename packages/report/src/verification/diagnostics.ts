import type { FactId } from "@numerology/engine";
import type { RuleId } from "@numerology/doctrine";
import type { ReportClaimId } from "../ids";
import {
  VERIFICATION_GATES,
  type VerificationDiagnostic,
  type VerificationGateName,
} from "./types";

export interface DiagnosticReferences {
  readonly claimId?: ReportClaimId;
  readonly factId?: FactId;
  readonly path?: string;
  readonly ruleId?: RuleId;
  readonly sectionId?: string;
}

export interface GateCheck {
  readonly checkedCount: number;
  readonly diagnostics: readonly VerificationDiagnostic[];
}

export function diagnostic(
  gate: VerificationGateName,
  code: string,
  references: DiagnosticReferences = {},
): VerificationDiagnostic {
  return { code, gate, ...references };
}

function compareOptional(left: string | undefined, right: string | undefined): number {
  return (left ?? "") < (right ?? "") ? -1 : (left ?? "") > (right ?? "") ? 1 : 0;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function sortDiagnostics(
  diagnostics: readonly VerificationDiagnostic[],
): readonly VerificationDiagnostic[] {
  const gateOrder = new Map(VERIFICATION_GATES.map((gate, index) => [gate, index]));
  return [...diagnostics].sort(
    (left, right) =>
      (gateOrder.get(left.gate) ?? 99) - (gateOrder.get(right.gate) ?? 99) ||
      compareText(left.code, right.code) ||
      compareOptional(left.claimId, right.claimId) ||
      compareOptional(left.factId, right.factId) ||
      compareOptional(left.ruleId, right.ruleId) ||
      compareOptional(left.sectionId, right.sectionId) ||
      compareOptional(left.path, right.path),
  );
}
