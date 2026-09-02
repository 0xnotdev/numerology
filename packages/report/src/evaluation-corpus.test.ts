import corpus from "@numerology/doctrine-data/report/eval-subjects.json";
import { describe, expect, it } from "vitest";
import { EVALUATION_SCENARIO_TAGS, parseEvaluationCorpus } from "./evaluation-corpus";

describe("frozen synthetic evaluation corpus", () => {
  it("contains unique balanced subjects and every required edge without customer data", () => {
    const subjects = parseEvaluationCorpus(corpus);
    const localeCounts = Object.fromEntries(
      ["en-IN", "hi-IN", "or-IN"].map((locale) => [
        locale,
        subjects.filter((subject) => subject.locale === locale).length,
      ]),
    );
    const tags = new Set(subjects.flatMap((subject) => subject.scenarioTags));

    expect(subjects).toHaveLength(60);
    expect(localeCounts).toEqual({ "en-IN": 20, "hi-IN": 20, "or-IN": 20 });
    expect(new Set(subjects.map((subject) => subject.subjectId))).toHaveLength(60);
    expect(tags).toEqual(new Set(EVALUATION_SCENARIO_TAGS));
    expect(
      subjects.filter((subject) => subject.adversarialText !== null).length,
    ).toBeGreaterThanOrEqual(12);
    expect(Object.isFrozen(subjects[0]?.scenarioTags)).toBe(true);
  });

  it("rejects unknown fields, duplicate IDs, missing rows, and unknown engine fixtures", () => {
    expect(() => parseEvaluationCorpus(corpus.slice(1))).toThrow();
    expect(() =>
      parseEvaluationCorpus(
        corpus.map((subject, index) => (index === 0 ? { ...subject, unknown: true } : subject)),
      ),
    ).toThrow();
    expect(() =>
      parseEvaluationCorpus(
        corpus.map((subject, index) =>
          index === 1 ? { ...subject, subjectId: corpus[0]?.subjectId } : subject,
        ),
      ),
    ).toThrow("EVALUATION_SUBJECT_DUPLICATE");
    expect(() =>
      parseEvaluationCorpus(
        corpus.map((subject, index) =>
          index === 0 ? { ...subject, engineFixtureId: "UNKNOWN" } : subject,
        ),
      ),
    ).toThrow("Unknown fixture");
    expect(() =>
      parseEvaluationCorpus(
        corpus.map((subject, index) =>
          index === 0 ? { ...subject, subjectId: "SYN-HI-001" } : subject,
        ),
      ),
    ).toThrow("EVALUATION_SUBJECT_LOCALE_MISMATCH");
    expect(() =>
      parseEvaluationCorpus(
        corpus.map((subject) =>
          subject.scenarioTags.includes("master_boundary")
            ? { ...subject, scenarioTags: ["compound"] }
            : subject,
        ),
      ),
    ).toThrow("EVALUATION_SCENARIO_COVERAGE");
  });
});
