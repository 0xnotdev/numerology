import { calculateFixture } from "@numerology/engine";
import { deepFreeze } from "@numerology/shared";
import { z } from "zod";
import { SUPPORTED_REPORT_LOCALES } from "./structured-report";

export const EVALUATION_SCENARIO_TAGS = [
  "adversarial_injection",
  "compound",
  "current_name_change",
  "long_name",
  "lo_shu_density",
  "mapping_divergence",
  "master_boundary",
  "root_balance",
  "safety_edge",
  "short_name",
  "timing_boundary",
  "unicode_script",
] as const;

const evaluationSubjectSchema = z.strictObject({
  adversarialText: z.string().min(1).max(240).nullable(),
  displayName: z.string().min(1).max(120),
  engineFixtureId: z.string().min(1),
  locale: z.enum(SUPPORTED_REPORT_LOCALES),
  scenarioTags: z.array(z.enum(EVALUATION_SCENARIO_TAGS)).min(1),
  subjectId: z.string().regex(/^SYN-(?:EN|HI|OR)-\d{3}$/u),
});

export const evaluationCorpusSchema = z.array(evaluationSubjectSchema).length(60);
const REQUIRED_LOCALE_COUNTS = Object.freeze({ "en-IN": 20, "hi-IN": 20, "or-IN": 20 });
const MINIMUM_SCENARIO_TAG_COUNT = 3;

export type EvaluationScenarioTag = (typeof EVALUATION_SCENARIO_TAGS)[number];
export type EvaluationSubject = Readonly<z.output<typeof evaluationSubjectSchema>>;

/** Strictly validates the frozen synthetic corpus and its engine-fixture references. */
export function parseEvaluationCorpus(input: unknown): readonly EvaluationSubject[] {
  const subjects = evaluationCorpusSchema.parse(input);
  const ids = new Set<string>();
  const localeCounts = new Map<string, number>();
  const tagCounts = new Map<string, number>();
  const fixtureCache = new Map<string, ReturnType<typeof calculateFixture>>();
  for (const subject of subjects) {
    if (ids.has(subject.subjectId)) {
      throw new RangeError(`EVALUATION_SUBJECT_DUPLICATE: ${subject.subjectId}`);
    }
    ids.add(subject.subjectId);
    const expectedPrefix =
      subject.locale === "en-IN" ? "SYN-EN-" : subject.locale === "hi-IN" ? "SYN-HI-" : "SYN-OR-";
    if (!subject.subjectId.startsWith(expectedPrefix)) {
      throw new RangeError(`EVALUATION_SUBJECT_LOCALE_MISMATCH: ${subject.subjectId}`);
    }
    localeCounts.set(subject.locale, (localeCounts.get(subject.locale) ?? 0) + 1);
    for (const tag of subject.scenarioTags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
    if (!fixtureCache.has(subject.engineFixtureId)) {
      fixtureCache.set(subject.engineFixtureId, calculateFixture(subject.engineFixtureId));
    }
  }
  for (const [locale, expected] of Object.entries(REQUIRED_LOCALE_COUNTS)) {
    if ((localeCounts.get(locale) ?? 0) !== expected) {
      throw new RangeError(`EVALUATION_LOCALE_DISTRIBUTION: ${locale}`);
    }
  }
  for (const tag of EVALUATION_SCENARIO_TAGS) {
    if ((tagCounts.get(tag) ?? 0) < MINIMUM_SCENARIO_TAG_COUNT) {
      throw new RangeError(`EVALUATION_SCENARIO_COVERAGE: ${tag}`);
    }
  }
  return deepFreeze(subjects);
}
