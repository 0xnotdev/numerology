import { isRuleId, parseRuleId } from "@numerology/doctrine";
import { canonicalHash, isFactId, parseFactId } from "@numerology/engine";
import { deepFreeze } from "@numerology/shared";
import { z } from "zod";
import { isReportClaimId, parseReportClaimId } from "../ids";
import { REPORT_VERIFICATION_SCHEMA_VERSION, REPORT_VERIFIER_VERSION } from "../report-versions";

export const VERIFICATION_GATES = [
  "schema",
  "numeric",
  "fact_linkage",
  "rule_source",
  "school_boundary",
  "contradiction",
  "completeness",
  "prose_provenance",
  "length",
  "repetition",
  "genericity",
  "language",
  "safety",
  "similarity",
  "pii",
] as const;

export type VerificationGateName = (typeof VERIFICATION_GATES)[number];

const sha256 = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const instant = z.string().refine((value) => {
  const parsed = new Date(value);
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value) &&
    !Number.isNaN(parsed.valueOf()) &&
    parsed.toISOString() === value
  );
});
const claimId = z
  .string()
  .refine(isReportClaimId, "Invalid claim identifier.")
  .transform(parseReportClaimId);
const factId = z.string().refine(isFactId, "Invalid fact identifier.").transform(parseFactId);
const ruleId = z.string().refine(isRuleId, "Invalid rule identifier.").transform(parseRuleId);

export const verificationDiagnosticSchema = z.strictObject({
  claimId: claimId.optional(),
  code: z.string().regex(/^[A-Z][A-Z0-9_]*$/u),
  factId: factId.optional(),
  gate: z.enum(VERIFICATION_GATES),
  path: z.string().min(1).max(240).optional(),
  ruleId: ruleId.optional(),
  sectionId: z
    .string()
    .regex(/^section\.[a-z][a-z0-9_]*$/u)
    .optional(),
});

export const verificationGateResultSchema = z.strictObject({
  checkedCount: z.number().int().nonnegative(),
  diagnosticCodes: z.array(z.string().regex(/^[A-Z][A-Z0-9_]*$/u)),
  gate: z.enum(VERIFICATION_GATES),
  passed: z.boolean(),
});

export const reportVerificationRecordSchema = z.strictObject({
  calculationBundleHash: sha256,
  diagnostics: z.array(verificationDiagnosticSchema),
  evidenceResolutionHash: sha256,
  gates: z.array(verificationGateResultSchema).length(VERIFICATION_GATES.length),
  planHash: sha256,
  recordHash: sha256,
  reportHash: sha256.nullable(),
  schemaVersion: z.literal(REPORT_VERIFICATION_SCHEMA_VERSION),
  valid: z.boolean(),
  verifiedAt: instant,
  verifierVersion: z.literal(REPORT_VERIFIER_VERSION),
});

type DeepReadonly<T> = T extends string | number | boolean | null | undefined
  ? T
  : T extends readonly (infer U)[]
    ? readonly DeepReadonly<U>[]
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;

export type VerificationDiagnostic = DeepReadonly<z.output<typeof verificationDiagnosticSchema>>;
export type VerificationGateResult = DeepReadonly<z.output<typeof verificationGateResultSchema>>;
export type ReportVerificationRecord = DeepReadonly<
  z.output<typeof reportVerificationRecordSchema>
>;

export function parseReportVerificationRecord(input: unknown): ReportVerificationRecord {
  const record = reportVerificationRecordSchema.parse(input);
  if (record.gates.some((gate, index) => gate.gate !== VERIFICATION_GATES[index])) {
    throw new RangeError("VERIFICATION_GATE_ORDER_INVALID");
  }
  if (
    record.gates.some(
      (gate) =>
        gate.passed !== (gate.diagnosticCodes.length === 0) ||
        new Set(gate.diagnosticCodes).size !== gate.diagnosticCodes.length ||
        gate.diagnosticCodes.some((code, index, codes) => {
          const previous = index > 0 ? codes[index - 1] : undefined;
          return previous !== undefined && previous > code;
        }) ||
        gate.diagnosticCodes.join("\u0000") !==
          [
            ...new Set(
              record.diagnostics.filter((item) => item.gate === gate.gate).map((item) => item.code),
            ),
          ]
            .sort()
            .join("\u0000"),
    )
  ) {
    throw new RangeError("VERIFICATION_GATE_RESULT_INVALID");
  }
  if (record.valid !== (record.diagnostics.length === 0)) {
    throw new RangeError("VERIFICATION_VALIDITY_INVALID");
  }
  const { recordHash: _recordHash, ...content } = record;
  if (canonicalHash(content) !== record.recordHash) {
    throw new RangeError("VERIFICATION_RECORD_HASH_MISMATCH");
  }
  return deepFreeze(record);
}
