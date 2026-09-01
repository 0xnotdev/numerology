import { describe, expect, it } from "vitest";
import {
  CANONICAL_RULE_RUNTIME_FIELDS,
  CANONICAL_RULE_SCHEMA,
  CLAIM_CLASSES,
  REVIEW_STATES,
  RULE_CONFIDENCES,
  RULE_STATUSES,
  RULE_TYPES,
  parseCanonicalRule,
} from "./canonical-rule";
import { validRule } from "./test-fixtures";

describe("canonical rule schema compilation and parity", () => {
  it("keeps every runtime field and enum in parity with data/rule.schema.json", () => {
    const properties = CANONICAL_RULE_SCHEMA.properties;

    expect(Object.keys(CANONICAL_RULE_RUNTIME_FIELDS).sort()).toEqual(
      Object.keys(properties).sort(),
    );
    expect(Object.values(CANONICAL_RULE_RUNTIME_FIELDS)).toEqual(
      Array(Object.keys(properties).length).fill(true),
    );
    expect(properties.status.enum).toEqual(RULE_STATUSES);
    expect(properties.rule_type.enum).toEqual(RULE_TYPES);
    expect(properties.claim_class.enum).toEqual(CLAIM_CLASSES);
    expect(properties.confidence.enum).toEqual(RULE_CONFIDENCES);
    expect(properties.review_state.enum).toEqual(REVIEW_STATES);
    expect(CANONICAL_RULE_SCHEMA.required).toEqual([
      "rule_id",
      "rule_version",
      "status",
      "profile_id",
      "rule_type",
      "trigger",
      "claim_class",
      "confidence",
      "source_links",
      "review_state",
    ]);
  });

  it("normalizes all optional canonical fields without inventing a second validator", () => {
    const full = validRule();
    const minimal = {
      claim_class: full.claim_class,
      confidence: full.confidence,
      profile_id: full.profile_id,
      review_state: "unreviewed",
      rule_id: "RULE_MINIMAL",
      rule_type: full.rule_type,
      rule_version: full.rule_version,
      source_links: [],
      status: "draft",
      trigger: full.trigger,
    };

    const parsed = parseCanonicalRule(minimal);

    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.value).toMatchObject({
      agreement_group: null,
      content_hash: null,
      contradiction_ids: [],
      locale: "en",
      metric_id: null,
      position_semantics: null,
      prohibited_phrases: [],
      reviewers: [],
      safe_paraphrases: [],
      themes: { constructive: [], tensions: [] },
      valid_from: null,
      valid_to: null,
    });
    expect(Object.keys(parsed.value ?? {}).sort()).toEqual(
      Object.keys(CANONICAL_RULE_RUNTIME_FIELDS).sort(),
    );
  });

  it.each([
    ["unknown property", { ...validRule(), invented: true }, "invented"],
    ["missing required field", { ...validRule(), rule_id: undefined }, "rule_id"],
    ["invalid review state", { ...validRule(), review_state: "published" }, "review_state"],
    ["invalid validity syntax", { ...validRule(), valid_from: "2026/02/01" }, "valid_from"],
    ["prefixed validity date", { ...validRule(), valid_from: "x2026-02-01" }, "valid_from"],
    ["suffixed validity date", { ...validRule(), valid_from: "2026-02-01x" }, "valid_from"],
    ["invalid validity month", { ...validRule(), valid_from: "2026-00-01" }, "valid_from"],
    ["invalid validity day", { ...validRule(), valid_from: "2026-02-30" }, "valid_from"],
    [
      "invalid source-link shape",
      { ...validRule(), source_links: [{ locator: "x", source_id: "bad source" }] },
      "source_links.0.source_id",
    ],
  ])("rejects %s through the canonical schema/brand boundary", (_name, input, path) => {
    const parsed = parseCanonicalRule(input);

    expect(parsed.value).toBeUndefined();
    expect(parsed.diagnostics.some((diagnostic) => diagnostic.path === path)).toBe(true);
  });

  it("reports root-object schema failures at the canonical root path", () => {
    expect(parseCanonicalRule(null).diagnostics[0]?.path).toBe("$");
  });

  it("reports all schema issues and exact nested/brand diagnostics", () => {
    const multiple = parseCanonicalRule({ ...validRule(), invented: true, review_state: "bad" });
    expect(multiple.diagnostics.map((item) => item.path)).toEqual(
      expect.arrayContaining(["invented", "review_state"]),
    );

    const missingLocator = parseCanonicalRule({
      ...validRule(),
      source_links: [{ source_id: "SRC_TEST" }],
    });
    expect(missingLocator.diagnostics[0]?.path).toBe("source_links.0.locator");

    const invalidSource = parseCanonicalRule({
      ...validRule(),
      source_links: [{ locator: "x", source_id: "bad source" }],
    });
    expect(invalidSource.diagnostics).toEqual([
      {
        code: "INVALID_SOURCE_ID",
        message: "source_id is not a valid branded source identifier.",
        path: "source_links.0.source_id",
      },
    ]);
  });
});
