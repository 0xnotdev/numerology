import { describe, expect, it } from "vitest";
import { calculateBundle, validateBundle } from "./index";

const request = {
  asOfDate: "2026-08-31",
  civilDate: "1990-08-12",
  names: [],
  profiles: ["western_decoz_v1"],
  schemaVersion: "1.0.0",
} as const;

function copyBundle(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(calculateBundle(request))) as Record<string, unknown>;
}

function invalidBundle(
  field: "traces" | "facts" | "warnings",
  value: unknown,
): ReturnType<typeof copyBundle> {
  const bundle = copyBundle();
  bundle[field] = value;
  return bundle;
}

describe("bundle validation defensive boundaries", () => {
  it("reports invalid top-level fields and collection shapes", () => {
    expect(validateBundle(null).valid).toBe(false);
    expect(validateBundle({}).diagnostics).toEqual(
      expect.arrayContaining([
        "engineVersion mismatch",
        "formulaManifestHash must be a sha256 hash",
        "inputHash must be a sha256 hash",
        "traces must be an array",
        "facts must be an array",
        "warnings must be an array",
      ]),
    );
    expect(
      validateBundle({
        engineVersion: "other",
        formulaManifestHash: `sha256:${"0".repeat(64)}`,
        inputHash: "bad",
        traces: "bad",
        facts: [],
        warnings: [],
      }).diagnostics,
    ).toContain("formulaManifestHash mismatch");
    expect(validateBundle(invalidBundle("traces", "bad")).diagnostics).toContain(
      "traces must be an array",
    );
    expect(validateBundle(invalidBundle("facts", "bad")).diagnostics).toContain(
      "facts must be an array",
    );
    expect(validateBundle(invalidBundle("warnings", "bad")).diagnostics).toContain(
      "warnings must be an array",
    );
  });

  it("reports every trace shape and value violation", () => {
    const validTrace = calculateBundle(request).traces[0];
    if (validTrace === undefined) {
      throw new Error("fixture request must produce a trace");
    }
    const trace = (change: Record<string, unknown>) =>
      validateBundle(invalidBundle("traces", [{ ...validTrace, ...change }])).diagnostics;

    expect(validateBundle(invalidBundle("traces", [null])).diagnostics).toContain(
      "trace[0] must be an object",
    );
    expect(trace({ traceId: "" })).toContain("trace[0] has an invalid traceId");
    expect(trace({ operation: "bad" })).toContain("trace[0] has an invalid operation");
    expect(trace({ inputs: "bad" })).toContain("trace[0] inputs/intermediates must be arrays");
    expect(trace({ intermediates: "bad" })).toContain(
      "trace[0] inputs/intermediates must be arrays",
    );
    expect(trace({ inputs: [null] })).toContain("trace[0] inputs must be numbers or strings");
    expect(trace({ intermediates: [-1] })).toContain(
      "trace[0] intermediates must be non-negative integers",
    );
    expect(trace({ policyId: "" })).toContain("trace[0] has an invalid policyId");
    expect(trace({ output: -1 })).toContain("trace[0] has an invalid output");
    expect(validateBundle(invalidBundle("traces", [validTrace, validTrace])).diagnostics).toContain(
      `duplicate trace: ${validTrace.traceId}`,
    );
  });

  it("reports every fact shape and value violation", () => {
    const validFact = calculateBundle(request).facts[0];
    if (validFact === undefined) {
      throw new Error("fixture request must produce a fact");
    }
    const fact = (change: Record<string, unknown>) =>
      validateBundle(invalidBundle("facts", [{ ...validFact, ...change }])).diagnostics;

    expect(validateBundle(invalidBundle("facts", [null])).diagnostics).toContain(
      "fact[0] must be an object",
    );
    expect(fact({ factId: "" })).toContain("fact[0] has an invalid factId");
    expect(fact({ metricId: "" })).toContain("fact[0] has an invalid metricId");
    expect(fact({ profileId: "bad" })).toContain("unsupported profile: bad");
    expect(fact({ root: -1 })).toContain("fact[0] has an invalid root");
    expect(fact({ displayTokens: "bad" })).toContain("fact[0] displayTokens must be an array");
    expect(fact({ displayTokens: [1] })).toContain("fact[0] displayTokens must contain strings");
    expect(fact({ compound: -1 })).toContain("fact[0] has an invalid compound");
    expect(fact({ master: 12 })).toContain("fact[0] has an invalid master");
    expect(fact({ traceIds: "bad" })).toContain("fact[0] traceIds must be an array");
    expect(fact({ traceIds: ["missing"] })).toContain("missing trace: missing");
    expect(
      validateBundle(invalidBundle("facts", [{ ...validFact }, { ...validFact }])).diagnostics,
    ).toContain(`duplicate fact: ${validFact.factId}`);
  });

  it("reports every warning shape and value violation", () => {
    const validWarning = {
      warningId: "warning.1",
      code: "MISSING_NAME_USE",
      message: "warning",
      policyId: "policy",
      severity: "warning",
    };
    const warning = (change: Record<string, unknown>) =>
      validateBundle(invalidBundle("warnings", [{ ...validWarning, ...change }])).diagnostics;

    expect(validateBundle(invalidBundle("warnings", [null])).diagnostics).toContain(
      "warning[0] must be an object",
    );
    expect(warning({ warningId: "" })).toContain("warning[0] has an invalid warningId");
    expect(warning({ code: "bad" })).toContain("warning[0] has an invalid code");
    expect(warning({ message: "" })).toContain("warning[0] has an invalid message");
    expect(warning({ policyId: "" })).toContain("warning[0] has an invalid policyId");
    expect(warning({ severity: "bad" })).toContain("warning[0] has an invalid severity");
    expect(warning({ profileId: "bad" })).toContain("warning[0] has an unsupported profile");
    expect(
      validateBundle(invalidBundle("warnings", [validWarning, validWarning])).diagnostics,
    ).toContain("duplicate warning: warning.1");
  });
});
