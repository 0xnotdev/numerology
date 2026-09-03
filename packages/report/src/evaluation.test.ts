import release from "@numerology/doctrine-data/doctrine/checkpoint4-fallback.compiled.json";
import expected from "@numerology/doctrine-data/report/eval-results.expected.json";
import corpus from "@numerology/doctrine-data/report/eval-subjects.json";
import { stableStringify } from "@numerology/engine";
import { describe, expect, it } from "vitest";
import { runEvaluationCorpus } from "./evaluation";

describe("executable sixty-subject golden evaluation", () => {
  it("replays every frozen subject and matches the committed outcome matrix", () => {
    const actual = runEvaluationCorpus(corpus, release);
    expect(actual).toHaveLength(60);
    expect(stableStringify(actual)).toBe(stableStringify(expected));

    const counts = Object.fromEntries(
      ["en-IN", "hi-IN", "or-IN"].map((locale) => [
        locale,
        actual.filter((result) => result.locale === locale).length,
      ]),
    );
    expect(counts).toEqual({ "en-IN": 20, "hi-IN": 20, "or-IN": 20 });
    expect(actual.filter((result) => result.status === "unsupported_locale")).toHaveLength(40);
    expect(actual.filter((result) => result.status === "verified")).toHaveLength(7);
    expect(actual.filter((result) => result.status === "rejected")).toHaveLength(13);
    expect(
      actual
        .filter((result) => result.locale === "en-IN" && result.status === "rejected")
        .map((result) => result.subjectId),
    ).toEqual([
      "SYN-EN-003",
      "SYN-EN-004",
      "SYN-EN-005",
      "SYN-EN-006",
      "SYN-EN-007",
      "SYN-EN-011",
      "SYN-EN-012",
      "SYN-EN-014",
      "SYN-EN-016",
      "SYN-EN-017",
      "SYN-EN-018",
      "SYN-EN-019",
      "SYN-EN-020",
    ]);
    for (const subjectId of [
      "SYN-EN-003",
      "SYN-EN-004",
      "SYN-EN-005",
      "SYN-EN-006",
      "SYN-EN-007",
      "SYN-EN-011",
      "SYN-EN-012",
      "SYN-EN-014",
    ]) {
      expect(actual.find((result) => result.subjectId === subjectId)?.diagnosticCodes).toEqual([
        "WRITER_CLAIM_CARDINALITY",
      ]);
    }
    expect(actual.find((result) => result.subjectId === "SYN-EN-016")?.diagnosticCodes).toEqual([
      "REPORT_CLAIM_SENTENCE_NOT_BOUND",
      "REPORT_NUMBER_NOT_ALLOWED",
      "REPORT_SENTENCE_PROVENANCE_INVALID",
      "REPORT_UNSAFE_LANGUAGE",
    ]);
    expect(actual.find((result) => result.subjectId === "SYN-EN-017")?.diagnosticCodes).toEqual([
      "REPORT_CLAIM_SENTENCE_NOT_BOUND",
      "REPORT_SENTENCE_PROVENANCE_INVALID",
      "REPORT_UNSAFE_LANGUAGE",
    ]);
    for (const subjectId of ["SYN-EN-018", "SYN-EN-019"]) {
      expect(actual.find((result) => result.subjectId === subjectId)?.diagnosticCodes).toEqual([
        "REPORT_CLAIM_SENTENCE_NOT_BOUND",
        "REPORT_LOCALE_SCRIPT_MISMATCH",
        "REPORT_SENTENCE_PROVENANCE_INVALID",
      ]);
    }
    expect(actual.find((result) => result.subjectId === "SYN-EN-020")?.diagnosticCodes).toEqual([
      "REPORT_CLAIM_SENTENCE_NOT_BOUND",
      "REPORT_SENTENCE_PROVENANCE_INVALID",
      "REPORT_UNSAFE_LANGUAGE",
    ]);
    const englishHashes = actual
      .filter((result) => result.locale === "en-IN")
      .map((result) => result.inputHash);
    expect(englishHashes.every((hash) => hash !== null)).toBe(true);
    expect(new Set(englishHashes).size).toBe(20);
    expect(
      actual
        .filter((result) => result.status === "unsupported_locale")
        .every((result) => result.inputHash !== null),
    ).toBe(true);
    expect(Object.isFrozen(actual)).toBe(true);
  });
});
