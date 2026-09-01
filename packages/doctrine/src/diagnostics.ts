import { deepFreeze } from "@numerology/shared";

export interface DoctrineDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly path: string;
}

export interface DoctrineValidationResult {
  readonly diagnostics: readonly DoctrineDiagnostic[];
  readonly valid: boolean;
}

export function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function diagnosticSort(left: DoctrineDiagnostic, right: DoctrineDiagnostic): number {
  return (
    compareText(left.path, right.path) ||
    compareText(left.code, right.code) ||
    compareText(left.message, right.message)
  );
}

export function freezeDiagnostics(
  diagnostics: readonly DoctrineDiagnostic[],
): readonly DoctrineDiagnostic[] {
  return deepFreeze([...diagnostics].sort(diagnosticSort).map((item) => ({ ...item })));
}

export class DoctrineCompileError extends RangeError {
  readonly diagnostics: readonly DoctrineDiagnostic[];

  constructor(kind: "COMPILE" | "SCHEMA", diagnostics: readonly DoctrineDiagnostic[]) {
    const frozen = freezeDiagnostics(diagnostics);
    super(
      `DOCTRINE_${kind}_INVALID: ${frozen
        .map((diagnostic) => `${diagnostic.code}@${diagnostic.path}`)
        .join(", ")}`,
    );
    this.name = "DoctrineCompileError";
    this.diagnostics = frozen;
  }
}
