import { deepFreeze } from "@numerology/shared";
import { parseCompiledDoctrine } from "./compiler";
import { DoctrineCompileError } from "./diagnostics";
import type { RuleId } from "./ids";
import { compareText } from "./diagnostics";
import { parseDoctrineAuthoringRelease, type DoctrineAuthoringRelease } from "./release-model";
import type { ReviewState } from "./canonical-rule";

export interface ReviewerRow {
  readonly claim: string;
  readonly contentHash: string | null;
  readonly reviewState: ReviewState;
  readonly reviewers: readonly string[];
  readonly ruleId: RuleId;
  readonly sourceCount: number;
  readonly status: string;
  readonly version: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asRelease(input: unknown): DoctrineAuthoringRelease {
  if (isRecord(input) && Object.hasOwn(input, "release_hash")) {
    return parseCompiledDoctrine(input);
  }
  const parsed = parseDoctrineAuthoringRelease(input);
  if (parsed.value === undefined) {
    throw new DoctrineCompileError("SCHEMA", parsed.diagnostics);
  }
  return parsed.value;
}

export function reviewerRows(input: unknown, state?: ReviewState): readonly ReviewerRow[] {
  return deepFreeze(
    asRelease(input)
      .rules.filter((rule) => state === undefined || rule.review_state === state)
      .sort((left, right) => compareText(left.rule_id, right.rule_id))
      .map((rule) => ({
        claim: rule.safe_paraphrases[0] ?? "—",
        contentHash: rule.content_hash,
        reviewState: rule.review_state,
        reviewers: [...rule.reviewers],
        ruleId: rule.rule_id,
        sourceCount: rule.source_links.length,
        status: rule.status,
        version: rule.rule_version,
      })),
  );
}

function escapeCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

export function renderReviewerView(input: unknown, state?: ReviewState): string {
  const rows = reviewerRows(input, state);
  const lines = [
    "| Rule | Version | Status | Review | Reviewers | Sources | Content hash | Claim |",
    "|---|---:|---|---|---|---:|---|---|",
    ...rows.map((row) =>
      [
        row.ruleId,
        row.version,
        row.status,
        row.reviewState,
        row.reviewers.join(", ") || "—",
        String(row.sourceCount),
        row.contentHash ?? "—",
        row.claim,
      ]
        .map(escapeCell)
        .join(" | ")
        .replace(/^/u, "| ")
        .replace(/$/u, " |"),
    ),
  ];
  return `${lines.join("\n")}\n`;
}
