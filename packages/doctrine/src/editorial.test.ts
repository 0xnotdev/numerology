import { describe, expect, it } from "vitest";
import { compileDoctrine } from "./compiler";
import {
  doctrineProfileMethod,
  DOCTRINE_PROFILE_METHODS,
  EDITORIAL_SECTIONS,
  REPORT_SECTION_KEYS,
} from "./editorial";
import { parseRuleId } from "./ids";
import { renderReviewerView, reviewerRows } from "./reviewer-view";
import { diffCompiledDoctrine } from "./semantic-diff";
import { bindingFor, validAuthoring, validRule } from "./test-fixtures";

describe("editorial semantic diff and reviewer viewer", () => {
  it("exports one immutable canonical section and profile-method catalog", () => {
    expect(EDITORIAL_SECTIONS.map((section) => section.key)).toEqual(REPORT_SECTION_KEYS);
    expect(EDITORIAL_SECTIONS.map((section) => section.order)).toEqual(
      Array.from({ length: REPORT_SECTION_KEYS.length }, (_, index) => index + 1),
    );
    expect(new Set(DOCTRINE_PROFILE_METHODS.map((method) => method.profileId)).size).toBe(7);
    expect(doctrineProfileMethod("western_digit_sum_v1")).toMatchObject({
      familyId: "modern-western",
      methodLabel: "Modern Western (digit-sum reduction)",
    });
    expect(Object.isFrozen(EDITORIAL_SECTIONS)).toBe(true);
    expect(Object.isFrozen(DOCTRINE_PROFILE_METHODS[0])).toBe(true);
  });

  it("reports deterministic field-level rule and binding changes", () => {
    const before = compileDoctrine(validAuthoring()).release;
    const changedRule = validRule({
      safe_paraphrases: ["A revised bounded reflection prompt."],
      themes: { constructive: ["communication"], tensions: ["scattering"] },
    });
    const after = compileDoctrine(
      validAuthoring({
        bindings: [bindingFor(undefined, { section_key: "core_overview" })],
        rules: [changedRule],
      }),
    ).release;

    const diff = diffCompiledDoctrine(before, after);

    expect(diff.beforeHash).not.toBe(diff.afterHash);
    expect(diff.rules.changed).toEqual([
      {
        changedFields: ["content_hash", "safe_paraphrases", "themes"],
        ruleId: "RULE_WESTERN_LP_3",
      },
    ]);
    expect(diff.bindingsChanged).toEqual(["RULE_WESTERN_LP_3"]);
    expect(diff.actions).toEqual({ added: [], changed: [], removed: [] });
    expect(Object.isFrozen(diff.rules.changed)).toBe(true);
  });

  it("sorts additions/removals and renders a filterable practical review queue", () => {
    const extra = validRule({
      review_state: "in_review",
      reviewers: ["editor@example.test"],
      rule_id: parseRuleId("RULE_REVIEW_QUEUE"),
      status: "draft",
    });
    const input = validAuthoring({
      bindings: [bindingFor(), bindingFor(extra.rule_id)],
      rules: [extra, validRule()],
    });
    const rows = reviewerRows(input, "in_review");
    const markdown = renderReviewerView(input, "in_review");

    expect(rows.map((row) => row.ruleId)).toEqual(["RULE_REVIEW_QUEUE"]);
    expect(markdown).toContain("| RULE_REVIEW_QUEUE | 1.0.0 | draft | in_review |");
    expect(markdown).not.toContain("RULE_WESTERN_LP_3");

    const before = compileDoctrine(validAuthoring()).release;
    const after = compileDoctrine(input).release;
    const diff = diffCompiledDoctrine(before, after);
    expect(diff.rules.added).toEqual(["RULE_REVIEW_QUEUE"]);
    const reverse = diffCompiledDoctrine(after, before);
    expect(reverse.rules.removed).toEqual(["RULE_REVIEW_QUEUE"]);
  });

  it("accepts compiled input, escapes markdown, and rejects malformed viewer input", () => {
    const draft = validRule({
      content_hash: null,
      review_state: "unreviewed",
      reviewers: [],
      safe_paraphrases: [],
      status: "draft",
    });
    const release = validAuthoring({ rules: [{ ...draft, content_hash: null }] });
    const compiled = compileDoctrine(release).release;

    expect(reviewerRows(compiled)[0]).toMatchObject({
      claim: "—",
      reviewers: [],
    });
    expect(renderReviewerView(release)).toContain("— | 1 | — | — |");
    const piped = validRule({ safe_paraphrases: ["Use a | bounded\nprompt."] });
    expect(renderReviewerView(validAuthoring({ rules: [piped] }))).toContain(
      "Use a \\| bounded prompt.",
    );
    expect(() => reviewerRows({})).toThrow("DOCTRINE_SCHEMA_INVALID");
  });
});
