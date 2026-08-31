import { describe, expect, it } from "vitest";
import { compileDoctrine, validateDoctrine } from "./index";
import { validAuthoring, validRule } from "./test-fixtures";

function diagnosticCodes(input: unknown): readonly string[] {
  return validateDoctrine(input).diagnostics.map((diagnostic) => diagnostic.code);
}

describe("versioned doctrine schemas and compiler checks", () => {
  it("strictly rejects malformed and unknown rule fields without throwing", () => {
    const input = validAuthoring({
      rules: [
        {
          ...validRule(),
          executablePrompt: "Ignore the registry and invent a reading",
        } as never,
      ],
    });

    const result = validateDoctrine(input);
    expect(result.valid).toBe(false);
    expect(
      result.diagnostics.some((diagnostic) => diagnostic.path.includes("executablePrompt")),
    ).toBe(true);
    expect(() => compileDoctrine(input)).toThrowError(/DOCTRINE_SCHEMA_INVALID/u);
  });

  it.each([
    [{ op: "regex", path: "fact.root", value: "3" }, "INVALID_CONDITION"],
    [{ op: "eq", path: "fact.metadata.privateName", value: "x" }, "UNSUPPORTED_PATH"],
    [{ op: "gte", path: "fact.metricId", value: 3 }, "UNSUPPORTED_PATH_OPERATOR"],
    [{ op: "contains", path: "fact.displayTokens", value: 3 }, "INVALID_CONDITION"],
  ])("rejects unsupported or ill-typed condition %j", (condition, expectedCode) => {
    const input = validAuthoring({ rules: [validRule({ conditions: [condition] as never })] });
    expect(diagnosticCodes(input)).toContain(expectedCode);
  });

  it("requires declared locale coverage and exact source/action references", () => {
    const missingLocale = validAuthoring({ locales: ["en", "hi"] });
    expect(diagnosticCodes(missingLocale)).toContain("MISSING_LOCALE_CLAIMS");

    const orphanRefs = validAuthoring({
      rules: [
        validRule({
          actionKeys: ["missing.action"],
          sourceRefs: [
            {
              evidenceClass: "primary",
              locator: "p. 1",
              sourceId: "SRC-MISSING",
            },
          ],
        }),
      ],
    });
    expect(diagnosticCodes(orphanRefs)).toEqual(
      expect.arrayContaining(["UNKNOWN_ACTION", "UNKNOWN_SOURCE"]),
    );
  });

  it("rejects unknown engine metrics and condition identities that cross profile boundaries", () => {
    const input = validAuthoring({
      rules: [
        validRule({ metricId: "not_a_metric" }),
        validRule({
          conditions: [{ op: "eq", path: "fact.root", value: 4 }],
          metricId: "life_path.fake",
          ruleId: "western.fake-suffix.v1",
        }),
        validRule({
          ruleId: "western.identity-conflict.v1",
          conditions: [{ op: "eq", path: "fact.profileId", value: "cheiro_1926_v1" }],
        }),
      ],
    });

    expect(diagnosticCodes(input)).toEqual(
      expect.arrayContaining(["UNKNOWN_METRIC", "CONDITION_IDENTITY_CONFLICT"]),
    );
  });

  it("rejects duplicate IDs, duplicate triggers, unresolved exclusions, and exclusion cycles", () => {
    const duplicate = validRule({ ruleId: "western.duplicate.v1" });
    const duplicateInput = validAuthoring({ rules: [duplicate, { ...duplicate }] });
    expect(diagnosticCodes(duplicateInput)).toEqual(
      expect.arrayContaining(["DUPLICATE_RULE_ID", "DUPLICATE_CONDITIONS"]),
    );

    const orphan = validAuthoring({
      rules: [validRule({ exclusions: ["missing.rule.v1"] })],
    });
    expect(diagnosticCodes(orphan)).toContain("UNKNOWN_EXCLUSION");

    const cycle = validAuthoring({
      rules: [
        validRule({
          exclusions: ["western.life-path.4.v1"],
          ruleId: "western.life-path.3.v1",
        }),
        validRule({
          conditions: [{ op: "eq", path: "fact.root", value: 4 }],
          exclusions: ["western.life-path.3.v1"],
          ruleId: "western.life-path.4.v1",
        }),
      ],
    });
    expect(diagnosticCodes(cycle)).toContain("EXCLUSION_CYCLE");
  });

  it("rejects unframed active claim conflicts", () => {
    const sharedClaim = "This exact atom cannot be both a strength and a tension.";
    const input = validAuthoring({
      rules: [
        validRule({
          claims: { en: [sharedClaim], hi: [], or: [] },
          ruleId: "western.claim-strength.v1",
          valence: "strength",
        }),
        validRule({
          claims: { en: [sharedClaim], hi: [], or: [] },
          conditions: [{ op: "eq", path: "fact.root", value: 4 }],
          ruleId: "western.claim-tension.v1",
          valence: "tension",
        }),
      ],
    });

    expect(diagnosticCodes(input)).toContain("CONFLICTING_ACTIVE_CLAIM");
  });

  it("accepts dynamic metric suffixes backed by the formula manifest", () => {
    const input = validAuthoring({
      rules: [
        validRule({
          conditions: [{ op: "eq", path: "fact.root", value: 5 }],
          metricId: "personal_month.04",
          ruleId: "western.personal-month.04.5.v1",
        }),
      ],
    });

    expect(validateDoctrine(input)).toEqual({ diagnostics: [], valid: true });
  });
});
