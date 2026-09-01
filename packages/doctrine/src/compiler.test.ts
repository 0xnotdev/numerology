import { describe, expect, it } from "vitest";
import {
  compileDoctrine,
  parseCompiledDoctrine,
  validateCompiledDoctrine,
  validateDoctrine,
} from "./compiler";
import { calculateRuleContentHash, isCanonicalHash } from "./content-hash";
import { parseActionId, parseRuleId, parseSourceId } from "./ids";
import { bindingFor, validAuthoring, validRule } from "./test-fixtures";

function codes(input: unknown): readonly string[] {
  return validateDoctrine(input).diagnostics.map((item) => item.code);
}

describe("doctrine validation and compilation", () => {
  it("compiles immutable deterministic releases, indexes roots, and emits reproducibility metadata", () => {
    const input = validAuthoring();
    const action = input.actions[0];
    if (action === undefined) {
      throw new Error("Missing test action.");
    }
    const reorderedRule = validRule({
      reviewers: ["safety@example.test", "editor@example.test"],
      themes: { constructive: ["expression"], tensions: ["scattering"] },
    });
    const reordered = validAuthoring({
      actions: [
        {
          ...action,
          safety_tags: ["reflective", "agency"],
        },
      ],
      rules: [reorderedRule],
    });

    const first = compileDoctrine(input);
    const second = compileDoctrine(reordered);

    expect(second.canonicalJson).toBe(first.canonicalJson);
    expect(second.manifest).toEqual(first.manifest);
    expect(first.release.index.byProfileMetricRoot.western_decoz_v1?.life_path?.["3"]).toEqual([
      "RULE_WESTERN_LP_3",
    ]);
    expect(first.manifest).toMatchObject({
      action_count: 1,
      canonical_rule_schema_hash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
      doctrine_hash: first.release.release_hash,
      profile_ids: ["western_decoz_v1"],
      rule_count: 1,
      source_count: 1,
    });
    expect(Object.isFrozen(first.release.rules[0]?.themes.constructive)).toBe(true);
    expect(validateCompiledDoctrine(JSON.parse(first.canonicalJson))).toEqual({
      diagnostics: [],
      valid: true,
    });
  });

  it("recognizes only exact canonical sha256 hashes", () => {
    const hash = `sha256:${"a".repeat(64)}`;
    expect(isCanonicalHash(hash)).toBe(true);
    for (const value of [null, 1, `x${hash}`, `${hash}x`, "sha256:ABC", "sha256:a"]) {
      expect(isCanonicalHash(value)).toBe(false);
    }
  });

  it("computes content hashes for non-active editorial records but requires reviewed hashes for active rules", () => {
    const draft = validRule({
      content_hash: null,
      metric_id: null,
      review_state: "unreviewed",
      reviewers: [],
      status: "draft",
    });
    const draftWithoutHash = { ...draft, content_hash: null };
    const release = validAuthoring({ rules: [draftWithoutHash] });

    const compiled = compileDoctrine(release);

    expect(compiled.release.rules[0]?.content_hash).toBe(calculateRuleContentHash(draft));
    expect(compiled.release.index.byProfileMetricRoot).toEqual({});
    expect(codes(validAuthoring({ rules: [{ ...validRule(), content_hash: null }] }))).toContain(
      "MISSING_CONTENT_HASH",
    );
    expect(
      codes(
        validAuthoring({ rules: [{ ...validRule(), content_hash: `sha256:${"0".repeat(64)}` }] }),
      ),
    ).toContain("CONTENT_HASH_MISMATCH");
  });

  it.each([
    [
      "review approval",
      validAuthoring({ rules: [validRule({ review_state: "in_review" })] }),
      "ACTIVE_RULE_NOT_APPROVED",
    ],
    [
      "two reviewers",
      validAuthoring({ rules: [validRule({ reviewers: ["only@example.test"] })] }),
      "INSUFFICIENT_REVIEWERS",
    ],
    [
      "known metrics",
      validAuthoring({ rules: [validRule({ metric_id: "invented" })] }),
      "UNKNOWN_METRIC",
    ],
    [
      "validity order",
      validAuthoring({
        rules: [validRule({ valid_from: "2026-12-01", valid_to: "2026-01-01" })],
      }),
      "INVALID_VALIDITY_RANGE",
    ],
    [
      "prohibited phrases",
      validAuthoring({
        rules: [
          validRule({
            prohibited_phrases: ["guaranteed"],
            safe_paraphrases: ["This is guaranteed."],
          }),
        ],
      }),
      "PROHIBITED_PHRASE_IN_CLAIM",
    ],
    [
      "condition identity",
      validAuthoring({
        rules: [
          validRule({
            trigger: { all: [{ op: "eq", path: "fact.metricId", value: "birthday" }] },
          }),
        ],
      }),
      "CONDITION_IDENTITY_CONFLICT",
    ],
    [
      "source references",
      validAuthoring({
        rules: [
          validRule({
            source_links: [
              {
                extraction_note: null,
                locator: "unknown",
                source_id: parseSourceId("SRC_UNKNOWN"),
              },
            ],
          }),
        ],
      }),
      "UNKNOWN_SOURCE",
    ],
    [
      "action references",
      validAuthoring({
        bindings: [
          bindingFor(parseRuleId("RULE_WESTERN_LP_3"), {
            action_ids: [parseActionId("reflect.unknown")],
          }),
        ],
      }),
      "UNKNOWN_ACTION",
    ],
    [
      "suppression references",
      validAuthoring({
        bindings: [
          bindingFor(parseRuleId("RULE_WESTERN_LP_3"), {
            suppresses_rule_ids: [parseRuleId("RULE_UNKNOWN")],
          }),
        ],
      }),
      "UNKNOWN_SUPPRESSION_TARGET",
    ],
  ])("rejects invalid %s", (_description, input, code) => {
    expect(codes(input)).toContain(code);
    expect(() => compileDoctrine(input)).toThrow(`DOCTRINE_COMPILE_INVALID`);
  });

  it("rejects duplicate IDs, missing bindings, self-suppression, and suppression cycles", () => {
    const first = validRule({ rule_id: parseRuleId("RULE_FIRST") });
    const second = validRule({ rule_id: parseRuleId("RULE_SECOND") });
    const cycle = validAuthoring({
      bindings: [
        bindingFor(first.rule_id, { suppresses_rule_ids: [second.rule_id] }),
        bindingFor(second.rule_id, { suppresses_rule_ids: [first.rule_id] }),
      ],
      rules: [first, second],
    });
    expect(codes(cycle)).toContain("SUPPRESSION_CYCLE");

    const self = validAuthoring({
      bindings: [
        bindingFor(undefined, { suppresses_rule_ids: [parseRuleId("RULE_WESTERN_LP_3")] }),
      ],
    });
    expect(codes(self)).toContain("SELF_SUPPRESSION");

    const duplicate = validAuthoring({ rules: [validRule(), validRule()] });
    expect(codes(duplicate)).toEqual(expect.arrayContaining(["DUPLICATE_RULE_ID"]));
    expect(codes(validAuthoring({ bindings: [] }))).toContain("MISSING_RULE_BINDING");
  });

  it("reports focused semantic failures for every editorial integrity invariant", () => {
    const contradiction = {
      contradiction_id: "CONTRA_TEST",
      dimension: "test",
      position_a: "a",
      position_b: "b",
      profile_a: "western_decoz_v1",
      profile_b: "cheiro_1926_v1",
      resolution: "separate",
    } as const;
    const sourceLink = validRule().source_links[0];
    const baseAction = validAuthoring().actions[0];
    const baseSource = validAuthoring().sources[0];
    if (sourceLink === undefined || baseAction === undefined || baseSource === undefined) {
      throw new Error("Missing test record.");
    }
    const semanticCases: readonly [unknown, string][] = [
      [
        validAuthoring({ rules: [validRule({ profile_id: "unknown_profile" })] }),
        "UNKNOWN_PROFILE",
      ],
      [validAuthoring({ rules: [validRule({ metric_id: null })] }), "ACTIVE_RULE_REQUIRES_METRIC"],
      [validAuthoring({ rules: [validRule({ locale: "hi" })] }), "UNKNOWN_RULE_LOCALE"],
      [
        validAuthoring({ rules: [{ ...validRule(), reviewers: ["same", "same"] }] }),
        "DUPLICATE_REVIEWER",
      ],
      [
        validAuthoring({ rules: [{ ...validRule(), source_links: [sourceLink, sourceLink] }] }),
        "DUPLICATE_SOURCE_LINK",
      ],
      [
        validAuthoring({
          contradictions: [contradiction],
          rules: [{ ...validRule(), contradiction_ids: ["CONTRA_TEST", "CONTRA_TEST"] }],
        }),
        "DUPLICATE_CONTRADICTION_REFERENCE",
      ],
      [validAuthoring({ rules: [validRule({ reviewers: ["", "reviewer"] })] }), "INVALID_REVIEWER"],
      [
        validAuthoring({ rules: [validRule({ safe_paraphrases: [""] })] }),
        "INVALID_SAFE_PARAPHRASE",
      ],
      [
        validAuthoring({ rules: [validRule({ prohibited_phrases: [""] })] }),
        "INVALID_PROHIBITED_PHRASE",
      ],
      [
        validAuthoring({
          rules: [validRule({ source_links: [{ ...sourceLink, locator: "" }] })],
        }),
        "INVALID_SOURCE_LOCATOR",
      ],
      [
        validAuthoring({ rules: [validRule({ contradiction_ids: ["CONTRA_UNKNOWN"] })] }),
        "UNKNOWN_CONTRADICTION",
      ],
      [
        validAuthoring({ rules: [{ ...validRule(), content_hash: "not-a-hash" }] }),
        "INVALID_CONTENT_HASH",
      ],
      [validAuthoring({ rules: [validRule({ safe_paraphrases: [] })] }), "MISSING_SAFE_PARAPHRASE"],
      [validAuthoring({ rules: [validRule({ source_links: [] })] }), "MISSING_SOURCE_LINK"],
      [
        validAuthoring({
          rules: [
            {
              ...validRule(),
              trigger: {
                all: [
                  { op: "eq", path: "fact.root", value: 3 },
                  { op: "eq", path: "fact.root", value: 3 },
                ],
              },
            },
          ],
        }),
        "DUPLICATE_CONDITION",
      ],
      [
        validAuthoring({
          rules: [
            {
              ...validRule(),
              trigger: {
                all: [
                  { op: "eq", path: "fact.root", value: 3 },
                  { op: "eq", path: "fact.root", value: 4 },
                ],
              },
            },
          ],
        }),
        "UNSATISFIABLE_CONDITIONS",
      ],
      [
        validAuthoring({
          rules: [
            validRule({
              trigger: {
                all: [
                  {
                    op: "eq",
                    path: "fact.profileId",
                    value: "cheiro_1926_v1",
                  },
                ],
              },
            }),
          ],
        }),
        "CONDITION_IDENTITY_CONFLICT",
      ],
      [validAuthoring({ rules: [validRule({ trigger: {} })] }), "INVALID_TRIGGER"],
      [
        validAuthoring({
          bindings: [
            bindingFor(undefined, {
              action_ids: [parseActionId("reflect.pause"), parseActionId("reflect.pause")],
            }),
          ],
        }),
        "DUPLICATE_ACTION_REFERENCE",
      ],
      [
        validAuthoring({
          bindings: [
            bindingFor(undefined, {
              suppresses_rule_ids: [parseRuleId("RULE_UNKNOWN"), parseRuleId("RULE_UNKNOWN")],
            }),
          ],
        }),
        "DUPLICATE_SUPPRESSION",
      ],
      [
        validAuthoring({
          bindings: [bindingFor(parseRuleId("RULE_UNKNOWN"))],
        }),
        "UNKNOWN_BOUND_RULE",
      ],
      [
        validAuthoring({
          actions: [baseAction, baseAction],
          bindings: [bindingFor(), bindingFor()],
          contradictions: [contradiction, contradiction],
          locales: ["en", "en"],
          sources: [baseSource, baseSource],
        }),
        "DUPLICATE_ACTION_ID",
      ],
      [validAuthoring({ locales: ["en", "hi"] }), "MISSING_ACTION_LOCALE"],
    ];

    for (const [input, code] of semanticCases) {
      expect(codes(input), code).toContain(code);
    }
  });

  it("accepts the allowlisted dynamic personal-month metric", () => {
    const rule = validRule({ metric_id: "personal_month.04" });
    expect(validateDoctrine(validAuthoring({ rules: [rule] })).valid).toBe(true);
  });

  it("reports canonical source-schema failures separately and rejects compiled tampering", () => {
    expect(validateDoctrine(null).diagnostics[0]?.path).toBe("$");
    const malformed = validAuthoring();
    const wire: Record<string, unknown> = {
      ...structuredClone(malformed),
      rules: [{ ...malformed.rules[0], rule_id: "lowercase" }],
    };
    expect(codes(wire)).toContain("CANONICAL_RULE_SCHEMA_INVALID");
    expect(() => compileDoctrine(wire)).toThrow("DOCTRINE_SCHEMA_INVALID");

    const release = compileDoctrine(validAuthoring()).release;
    const badHash = { ...release, release_hash: `sha256:${"0".repeat(64)}` };
    expect(validateCompiledDoctrine(badHash).diagnostics.map((item) => item.code)).toContain(
      "RELEASE_HASH_MISMATCH",
    );
    const badIndex = { ...release, index: { byProfileMetricRoot: {} } };
    expect(validateCompiledDoctrine(badIndex).diagnostics.map((item) => item.code)).toContain(
      "NON_CANONICAL_RELEASE",
    );
    expect(() => parseCompiledDoctrine({ ...release, invented: true })).toThrow(
      "COMPILED_SCHEMA_INVALID",
    );
    expect(() => parseCompiledDoctrine(null)).toThrow("COMPILED_SCHEMA_INVALID");
    const invalidAuthoring = {
      ...release,
      rules: [{ ...release.rules[0], review_state: "unreviewed" }],
    };
    expect(validateCompiledDoctrine(invalidAuthoring).valid).toBe(false);
  });
});
