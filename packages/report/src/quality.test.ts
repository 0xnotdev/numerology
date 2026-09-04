import release from "@numerology/doctrine-data/doctrine/checkpoint4-fallback.compiled.json";
import corpus from "@numerology/doctrine-data/report/eval-subjects.json";
import { canonicalHash } from "@numerology/engine";
import { describe, expect, it } from "vitest";
import {
  assessReportQuality,
  buildReportQualityReviewPacket,
  decideRelease,
  NATIVE_REVIEW_DIMENSIONS,
  parseQualityArtifact,
  parseQualityAssessment,
  QUALITY_CORPUS_HASH,
  QualityInputError,
} from "./quality";

function rehashArtifact(
  artifact: ReturnType<typeof assessReportQuality>["artifact"],
  changes: Record<string, unknown>,
) {
  const content = { ...artifact, ...changes } as Record<string, unknown>;
  delete content.artifactHash;
  return { ...content, artifactHash: canonicalHash(content) };
}

function rehashAssessment(
  assessment: ReturnType<typeof assessReportQuality>,
  changes: Record<string, unknown>,
) {
  const content = { ...assessment, ...changes } as Record<string, unknown>;
  delete content.assessmentHash;
  return { ...content, assessmentHash: canonicalHash(content) };
}

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Expected ${label}`);
  return value;
}

describe("deterministic report quality contract", () => {
  it("replays the real sixty-subject corpus and reports the blocked baseline", () => {
    const assessment = assessReportQuality({
      corpus,
      release,
      requestedLocales: ["en-IN"],
    });

    expect(assessment.eligible).toBe(false);
    expect(assessment.artifact.corpusHash).toBe(QUALITY_CORPUS_HASH);
    expect(assessment.artifact.outcomes).toHaveLength(60);
    expect(assessment.automated.counts).toMatchObject({
      verified: 7,
      ordinaryFailure: 8,
      expectedAdversarialRejection: 5,
      unsupportedLocale: 0,
    });
    expect(assessment.blockers).toContain("QUALITY_AUTOMATED_ACCEPTANCE_BELOW_98");
    expect(assessment.blockers).toContain("QUALITY_ORDINARY_SUBJECT_FAILURE");
    expect(assessment.blockers).not.toContain("QUALITY_NATIVE_REVIEW_FABRICATED");
  });

  it("credits adversarial rows only when the real verifier reports relevant detection", () => {
    const assessment = assessReportQuality({
      corpus,
      release,
      requestedLocales: ["en-IN"],
    });
    const adversarial = assessment.artifact.outcomes.filter(
      (item) => item.locale === "en-IN" && item.expectedScenario === "adversarial",
    );
    expect(adversarial).toHaveLength(5);
    expect(adversarial.every((item) => item.outcome === "expected_adversarial_rejection")).toBe(
      true,
    );
    expect(
      adversarial.every((item) =>
        item.diagnosticCodes.some((code) =>
          [
            "REPORT_CLAIM_SENTENCE_NOT_BOUND",
            "REPORT_LOCALE_SCRIPT_MISMATCH",
            "REPORT_NUMBER_NOT_ALLOWED",
            "REPORT_SENTENCE_PROVENANCE_INVALID",
            "REPORT_UNSAFE_LANGUAGE",
          ].includes(code),
        ),
      ),
    ).toBe(true);
  });

  it("does not accept a shape-valid replacement corpus as a promotion source", () => {
    const altered = structuredClone(corpus) as Array<Record<string, unknown>>;
    altered[0] = {
      ...required(altered[0], "the first corpus subject"),
      displayName: "Caller-controlled subject",
    };
    const assessment = assessReportQuality({
      corpus: altered,
      release,
      requestedLocales: ["en-IN"],
    });
    expect(assessment.artifact.corpusHash).not.toBe(QUALITY_CORPUS_HASH);
    expect(assessment.blockers).toContain("QUALITY_CORPUS_IDENTITY_MISMATCH");
    expect(assessment.eligible).toBe(false);
  });

  it.each([[[]], [["en-IN", "en-IN"]], [["fr-FR"]]])(
    "rejects invalid requested locales %j",
    (requestedLocales) => {
      expect(() => assessReportQuality({ corpus, release, requestedLocales })).toThrow(
        QualityInputError,
      );
    },
  );

  it("rejects stale or malformed native review evidence at the public seam", () => {
    const baseline = assessReportQuality({
      corpus,
      release,
      requestedLocales: ["en-IN"],
    });
    const review = {
      artifactHash: canonicalHash({ stale: true }),
      locale: "en-IN",
      reviewerId: "operator@example.test",
      reviewedAt: "2026-09-01T00:00:00.000Z",
      reviewedReportHashes: [],
      scores: Object.fromEntries(NATIVE_REVIEW_DIMENSIONS.map((dimension) => [dimension, 4.5])),
      factualFlag: false,
      safetyFlag: false,
      reviewHash: `sha256:${"0".repeat(64)}`,
    };
    expect(() =>
      assessReportQuality({
        corpus,
        release,
        requestedLocales: ["en-IN"],
        reviews: [review],
      }),
    ).toThrow(QualityInputError);
    expect(parseQualityArtifact(baseline.artifact)).toEqual(baseline.artifact);
    expect(parseQualityAssessment(baseline)).toEqual(baseline);
  });

  it("seals a raw native review and keeps native eligibility separate from automated failures", () => {
    const baseline = assessReportQuality({
      corpus,
      release,
      requestedLocales: ["en-IN"],
    });
    const reviewedReportHashes = baseline.artifact.outcomes
      .filter(
        (item) =>
          item.locale === "en-IN" &&
          item.expectedScenario === "ordinary" &&
          item.outcome === "verified" &&
          item.reportHash !== null,
      )
      .map((item) => item.reportHash as string)
      .sort();
    const review = {
      artifactHash: baseline.artifact.artifactHash,
      locale: "en-IN",
      reviewerId: "operator@example.test",
      reviewedAt: "2026-09-01T00:00:00.000Z",
      reviewedReportHashes,
      scores: Object.fromEntries(NATIVE_REVIEW_DIMENSIONS.map((dimension) => [dimension, 4.5])),
      factualFlag: false,
      safetyFlag: false,
    };
    const reviewed = assessReportQuality({
      corpus,
      release,
      requestedLocales: ["en-IN"],
      reviews: [review],
    });
    expect(reviewed.nativeReview.eligible).toBe(true);
    expect(reviewed.nativeReview.mean).toBe(4.5);
    expect(reviewed.nativeReview.reviews[0]?.reviewHash).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(reviewed.eligible).toBe(false);
  });

  it("accepts a correctly pre-sealed native review and preserves the strict parsed form", () => {
    const baseline = assessReportQuality({ corpus, release, requestedLocales: ["en-IN"] });
    const reviewedReportHashes = baseline.artifact.outcomes
      .filter(
        (item) =>
          item.locale === "en-IN" &&
          item.expectedScenario === "ordinary" &&
          item.outcome === "verified" &&
          item.reportHash !== null,
      )
      .map((item) => item.reportHash as string)
      .sort();
    const reviewContent = {
      artifactHash: baseline.artifact.artifactHash,
      locale: "en-IN" as const,
      reviewerId: "operator@example.test",
      reviewedAt: "2026-09-01T00:00:00.000Z",
      reviewedReportHashes,
      scores: Object.fromEntries(NATIVE_REVIEW_DIMENSIONS.map((dimension) => [dimension, 4.5])),
      factualFlag: false,
      safetyFlag: false,
    };
    const review = { ...reviewContent, reviewHash: canonicalHash(reviewContent) };
    const assessed = assessReportQuality({
      corpus,
      release,
      requestedLocales: ["en-IN"],
      reviews: [review],
    });
    expect(assessed.nativeReview.reviews[0]?.reviewHash).toBe(review.reviewHash);
    expect(parseQualityAssessment(assessed)).toEqual(assessed);
  }, 30_000);

  it("blocks weak, flagged, incomplete, and per-locale native reviews", () => {
    const baseline = assessReportQuality({ corpus, release, requestedLocales: ["en-IN"] });
    const hashes = baseline.artifact.outcomes
      .filter(
        (item) =>
          item.locale === "en-IN" &&
          item.expectedScenario === "ordinary" &&
          item.outcome === "verified" &&
          item.reportHash !== null,
      )
      .map((item) => item.reportHash as string)
      .sort();
    const weakReview = {
      artifactHash: baseline.artifact.artifactHash,
      locale: "en-IN",
      reviewerId: "operator@example.test",
      reviewedAt: "2026-09-01T00:00:00.000Z",
      reviewedReportHashes: hashes,
      scores: Object.fromEntries(NATIVE_REVIEW_DIMENSIONS.map((dimension) => [dimension, 4])),
      factualFlag: true,
      safetyFlag: false,
    };
    const weak = assessReportQuality({
      corpus,
      release,
      requestedLocales: ["en-IN"],
      reviews: [weakReview],
    });
    expect(weak.nativeReview.eligible).toBe(false);
    expect(weak.blockers).toContain("QUALITY_NATIVE_REVIEW_FLAGGED:en-IN");
    expect(weak.blockers).toContain("QUALITY_NATIVE_REVIEW_MEAN_BELOW_4_2:en-IN");
    const belowDimension = assessReportQuality({
      corpus,
      release,
      requestedLocales: ["en-IN"],
      reviews: [
        {
          ...weakReview,
          factualFlag: false,
          scores: { ...weakReview.scores, naturalness: 3.9 },
        },
      ],
    });
    expect(belowDimension.blockers).toContain("QUALITY_NATIVE_REVIEW_DIMENSION_BELOW_4:en-IN");
    expect(() =>
      assessReportQuality({
        corpus,
        release,
        requestedLocales: ["en-IN"],
        reviews: [{ ...weakReview, reviewedReportHashes: [] }],
      }),
    ).toThrow("QUALITY_NATIVE_REVIEW_COVERAGE_MISMATCH");
    const unsupported = assessReportQuality({ corpus, release, requestedLocales: ["hi-IN"] });
    expect(unsupported.blockers).toContain("QUALITY_NATIVE_REVIEW_MISSING:hi-IN");
    const emptyCoverageReview = {
      ...weakReview,
      artifactHash: unsupported.artifact.artifactHash,
      locale: "hi-IN",
      reviewedReportHashes: [],
    };
    const empty = assessReportQuality({
      corpus,
      release,
      requestedLocales: ["hi-IN"],
      reviews: [emptyCoverageReview],
    });
    expect(empty.blockers).toContain("QUALITY_NATIVE_REVIEW_COVERAGE_EMPTY:hi-IN");
  }, 30_000);

  it("rejects self-rehashed artifacts and stale derived summaries", () => {
    const baseline = assessReportQuality({ corpus, release, requestedLocales: ["en-IN"] });
    expect(() =>
      parseQualityArtifact({
        ...baseline.artifact,
        artifactHash: `sha256:${"0".repeat(64)}`,
      }),
    ).toThrow("QUALITY_ARTIFACT_HASH_MISMATCH");
    expect(() =>
      parseQualityArtifact(
        rehashArtifact(baseline.artifact, {
          versions: { ...baseline.artifact.versions, writer: "stale-writer" },
        }),
      ),
    ).toThrow("QUALITY_ARTIFACT_VERSION_MISMATCH");
    const wrongOutcome = [...baseline.artifact.outcomes];
    const ordinary = wrongOutcome.findIndex(
      (item) => item.expectedScenario === "ordinary" && item.outcome === "ordinary_failure",
    );
    wrongOutcome[ordinary] = {
      ...required(wrongOutcome[ordinary], "an ordinary failed outcome"),
      outcome: "verified",
    };
    expect(() =>
      parseQualityArtifact(rehashArtifact(baseline.artifact, { outcomes: wrongOutcome })),
    ).toThrow("QUALITY_ARTIFACT_OUTCOME_SEMANTICS_INVALID");
    expect(() =>
      parseQualityArtifact(
        rehashArtifact(baseline.artifact, { requestedLocales: ["en-IN", "en-IN"] }),
      ),
    ).toThrow("QUALITY_ARTIFACT_LOCALES_INVALID");
    expect(() =>
      parseQualityAssessment(
        rehashAssessment(baseline, {
          automated: { ...baseline.automated, passed: baseline.automated.passed + 1 },
        }),
      ),
    ).toThrow("QUALITY_ASSESSMENT_AUTOMATED_MISMATCH");
    expect(() =>
      parseQualityAssessment(
        rehashAssessment(baseline, {
          nativeReview: { ...baseline.nativeReview, requiredLocales: ["hi-IN"] },
        }),
      ),
    ).toThrow("QUALITY_ASSESSMENT_NATIVE_LOCALES_MISMATCH");
    expect(() => parseQualityAssessment(null)).toThrow(QualityInputError);
    expect(() => parseQualityArtifact(null)).toThrow("QUALITY_ARTIFACT_INVALID");
    expect(() =>
      parseQualityAssessment({
        ...baseline,
        assessmentHash: `sha256:${"0".repeat(64)}`,
      }),
    ).toThrow("QUALITY_ASSESSMENT_HASH_MISMATCH");
    expect(() =>
      parseQualityAssessment(rehashAssessment(baseline, { blockers: baseline.blockers.slice(1) })),
    ).toThrow("QUALITY_ASSESSMENT_BLOCKERS_MISMATCH");
    expect(() => parseQualityAssessment(rehashAssessment(baseline, { eligible: true }))).toThrow(
      "QUALITY_ASSESSMENT_ELIGIBILITY_MISMATCH",
    );
    expect(() =>
      parseQualityAssessment(
        rehashAssessment(baseline, {
          nativeReview: { ...baseline.nativeReview, mean: 4 },
        }),
      ),
    ).toThrow("QUALITY_ASSESSMENT_NATIVE_MISMATCH");
  }, 30_000);

  it("rejects untrusted corpus identity, locale/order, inventory, and diagnostic mutations", () => {
    const baseline = assessReportQuality({ corpus, release, requestedLocales: ["en-IN", "hi-IN"] });
    expect(() =>
      parseQualityArtifact(
        rehashArtifact(baseline.artifact, {
          corpusHash: canonicalHash({ replacement: true }),
        }),
      ),
    ).toThrow("QUALITY_ARTIFACT_CORPUS_UNTRUSTED");
    expect(() =>
      parseQualityArtifact(
        rehashArtifact(baseline.artifact, {
          requestedLocales: ["hi-IN", "en-IN"],
        }),
      ),
    ).toThrow("QUALITY_ARTIFACT_LOCALE_ORDER_INVALID");

    const duplicateSubject = [...baseline.artifact.outcomes];
    const first = required(duplicateSubject[0], "the first quality outcome");
    const second = required(duplicateSubject[1], "the second quality outcome");
    duplicateSubject[0] = {
      ...first,
      subjectId: second.subjectId,
    };
    expect(() =>
      parseQualityArtifact(rehashArtifact(baseline.artifact, { outcomes: duplicateSubject })),
    ).toThrow("QUALITY_ARTIFACT_SUBJECT_INVENTORY_INVALID");

    expect(() =>
      parseQualityArtifact(
        rehashArtifact(baseline.artifact, {
          outcomes: [...baseline.artifact.outcomes].reverse(),
        }),
      ),
    ).toThrow("QUALITY_ARTIFACT_OUTCOME_ORDER_INVALID");

    const diagnostics = [...baseline.artifact.outcomes];
    const diagnosticIndex = diagnostics.findIndex(
      (item) =>
        item.outcome === "expected_adversarial_rejection" && item.diagnosticCodes.length > 1,
    );
    const diagnostic = required(diagnostics[diagnosticIndex], "an adversarial diagnostic outcome");
    const code = required(diagnostic.diagnosticCodes[0], "an adversarial diagnostic code");
    diagnostics[diagnosticIndex] = {
      ...diagnostic,
      diagnosticCodes: [code, code],
    };
    expect(() =>
      parseQualityArtifact(rehashArtifact(baseline.artifact, { outcomes: diagnostics })),
    ).toThrow("QUALITY_ARTIFACT_DIAGNOSTICS_ORDER_INVALID");
  }, 30_000);

  it("keeps outcome/status/hash semantics aligned for verified adversarial and unsupported rows", () => {
    const baseline = assessReportQuality({ corpus, release, requestedLocales: ["en-IN"] });
    const verifiedAdversarial = [...baseline.artifact.outcomes];
    const adversarialIndex = verifiedAdversarial.findIndex(
      (item) => item.expectedScenario === "adversarial" && item.actualStatus === "rejected",
    );
    const rejectedAdversarial = required(
      verifiedAdversarial[adversarialIndex],
      "a rejected adversarial outcome",
    );
    verifiedAdversarial[adversarialIndex] = {
      ...rejectedAdversarial,
      actualStatus: "verified",
      diagnosticCodes: [],
      inputHash: `sha256:${"1".repeat(64)}`,
      outcome: "adversarial_failure",
      reportHash: `sha256:${"2".repeat(64)}`,
    };
    expect(() =>
      parseQualityArtifact(rehashArtifact(baseline.artifact, { outcomes: verifiedAdversarial })),
    ).not.toThrow();

    const missingInputHash = [...verifiedAdversarial];
    missingInputHash[adversarialIndex] = {
      ...required(missingInputHash[adversarialIndex], "a verified adversarial outcome"),
      inputHash: null,
    };
    expect(() =>
      parseQualityArtifact(rehashArtifact(baseline.artifact, { outcomes: missingInputHash })),
    ).toThrow("QUALITY_ARTIFACT_OUTCOME_SEMANTICS_INVALID");

    const unsupported = [...baseline.artifact.outcomes];
    const unsupportedIndex = unsupported.findIndex(
      (item) => item.actualStatus === "unsupported_locale",
    );
    unsupported[unsupportedIndex] = {
      ...required(unsupported[unsupportedIndex], "an unsupported locale outcome"),
      reportHash: `sha256:${"3".repeat(64)}`,
    };
    expect(() =>
      parseQualityArtifact(rehashArtifact(baseline.artifact, { outcomes: unsupported })),
    ).toThrow("QUALITY_ARTIFACT_OUTCOME_SEMANTICS_INVALID");
  }, 30_000);

  it("keeps review packet scope to requested verified ordinary reports", () => {
    const packet = assessReportQuality({ corpus, release, requestedLocales: ["en-IN", "hi-IN"] });
    expect(packet.artifact.outcomes.filter((item) => item.locale === "hi-IN")).toHaveLength(20);
    expect(
      buildReportQualityReviewPacket({ corpus, release, requestedLocales: ["en-IN"] }).reports,
    ).toHaveLength(7);
  });

  it("rejects mixed unrelated diagnostics on an adversarial outcome", () => {
    const baseline = assessReportQuality({ corpus, release, requestedLocales: ["en-IN"] });
    const outcomes = [...baseline.artifact.outcomes];
    const index = outcomes.findIndex((item) => item.subjectId === "SYN-EN-016");
    const adversarial = required(outcomes[index], "SYN-EN-016");
    outcomes[index] = {
      ...adversarial,
      diagnosticCodes: [...adversarial.diagnosticCodes, "WRITER_CLAIM_CARDINALITY"].sort(),
    };
    expect(() => parseQualityArtifact(rehashArtifact(baseline.artifact, { outcomes }))).toThrow(
      "QUALITY_ARTIFACT_OUTCOME_SEMANTICS_INVALID",
    );
  }, 30_000);

  it("rejects invalid release identities and null public inputs", () => {
    expect(() => assessReportQuality(null as never)).toThrow("QUALITY_INPUT_INVALID");
    expect(() =>
      assessReportQuality({ corpus, release: null, requestedLocales: ["en-IN"] }),
    ).toThrow("QUALITY_RELEASE_INVALID");
    expect(() => assessReportQuality({ corpus, release: [], requestedLocales: ["en-IN"] })).toThrow(
      "QUALITY_RELEASE_INVALID",
    );
    expect(() =>
      assessReportQuality({
        corpus,
        release: { release_id: "only-id" },
        requestedLocales: ["en-IN"],
      }),
    ).toThrow("QUALITY_RELEASE_INVALID");
  }, 30_000);

  it("rejects duplicate, unrequested, stale, and unsorted native review evidence", () => {
    const baseline = assessReportQuality({ corpus, release, requestedLocales: ["en-IN"] });
    const hashes = baseline.artifact.outcomes
      .filter(
        (item) =>
          item.locale === "en-IN" &&
          item.expectedScenario === "ordinary" &&
          item.outcome === "verified" &&
          item.reportHash !== null,
      )
      .map((item) => item.reportHash as string)
      .sort();
    const baseReview = {
      artifactHash: baseline.artifact.artifactHash,
      locale: "en-IN" as const,
      reviewerId: "operator@example.test",
      reviewedAt: "2026-09-01T00:00:00.000Z",
      reviewedReportHashes: hashes,
      scores: Object.fromEntries(NATIVE_REVIEW_DIMENSIONS.map((dimension) => [dimension, 4.5])),
      factualFlag: false,
      safetyFlag: false,
    };
    expect(() =>
      assessReportQuality({
        corpus,
        release,
        requestedLocales: ["en-IN"],
        reviews: [baseReview, baseReview],
      }),
    ).toThrow("QUALITY_NATIVE_REVIEW_DUPLICATE_LOCALE");
    expect(() =>
      assessReportQuality({
        corpus,
        release,
        requestedLocales: ["en-IN"],
        reviews: [{ ...baseReview, locale: "hi-IN" }],
      }),
    ).toThrow("QUALITY_NATIVE_REVIEW_LOCALE_UNREQUESTED");
    expect(() =>
      assessReportQuality({
        corpus,
        release,
        requestedLocales: ["en-IN"],
        reviews: [{ ...baseReview, artifactHash: `sha256:${"0".repeat(64)}` }],
      }),
    ).toThrow("QUALITY_NATIVE_REVIEW_ARTIFACT_MISMATCH");
    expect(() =>
      assessReportQuality({
        corpus,
        release,
        requestedLocales: ["en-IN"],
        reviews: [{ ...baseReview, reviewedReportHashes: [...hashes].reverse() }],
      }),
    ).toThrow("QUALITY_NATIVE_REVIEW_HASH_ORDER_INVALID");
    const packet = buildReportQualityReviewPacket({ corpus, release });
    expect(packet.reports).toHaveLength(7);
  }, 30_000);

  it("keeps rollback fail-closed when an approved history summary meets a blocked replay", () => {
    const assessed = assessReportQuality({ corpus, release, requestedLocales: ["en-IN"] });
    const result = decideRelease({
      action: "rollback",
      corpus,
      release,
      requestedLocales: ["en-IN"],
      target: { artifactHash: assessed.artifact.artifactHash, locales: ["en-IN"] },
      history: [
        {
          approved: true,
          approvedAt: "2026-09-01T00:00:00.000Z",
          artifact: assessed.artifact,
          assessment: assessed,
        },
      ],
    });
    expect(result.eligible).toBe(false);
    expect(result.selectedArtifactHash).toBeNull();
    expect(result.blockers).toContain("QUALITY_ROLLBACK_REPLAY_NOT_ELIGIBLE");
  }, 30_000);

  it("cannot promote a caller-supplied eligible summary without an exact replay target", () => {
    const result = decideRelease({
      action: "promote",
      corpus,
      release,
      requestedLocales: ["en-IN"],
      target: { artifactHash: `sha256:${"0".repeat(64)}`, locales: ["en-IN"] },
      history: [],
    });
    expect(result.eligible).toBe(false);
    expect(result.action).toBe("blocked");
    expect(result.blockers).toContain("QUALITY_PROMOTION_TARGET_MISMATCH");
  });

  it("requires target locales to bind exactly and never trusts optional history fields", () => {
    const assessed = assessReportQuality({ corpus, release, requestedLocales: ["en-IN"] });
    const base = {
      corpus,
      release,
      requestedLocales: ["en-IN"],
      target: { artifactHash: assessed.artifact.artifactHash, locales: ["hi-IN"] },
      history: [],
    };
    expect(() => decideRelease({ ...base, action: "promote" })).toThrow(
      "QUALITY_TARGET_LOCALES_MISMATCH",
    );

    const result = decideRelease({
      action: "rollback",
      corpus,
      release,
      requestedLocales: ["en-IN"],
      reviews: [],
      target: { artifactHash: assessed.artifact.artifactHash, locales: ["en-IN"] },
      history: [{ artifact: assessed.artifact, assessment: assessed }],
    });
    expect(result.eligible).toBe(false);
    expect(result.blockers).toContain("QUALITY_ROLLBACK_HISTORY_NOT_ELIGIBLE");
  }, 30_000);

  it("recomputes passing and adversarial-failure automated summaries from sealed artifacts", () => {
    const baseline = assessReportQuality({ corpus, release, requestedLocales: ["en-IN"] });
    const passingOutcomes = baseline.artifact.outcomes.map((outcome, index) =>
      outcome.expectedScenario === "ordinary" && outcome.outcome === "ordinary_failure"
        ? {
            ...outcome,
            actualStatus: "verified" as const,
            diagnosticCodes: [],
            outcome: "verified" as const,
            reportHash: `sha256:${String(index + 1).padStart(64, "0")}`,
          }
        : outcome,
    );
    const passingArtifact = rehashArtifact(baseline.artifact, { outcomes: passingOutcomes });
    const passingAutomated = {
      acceptanceRate: 1,
      adversarialPassed: 5,
      adversarialTotal: 5,
      counts: {
        adversarialFailure: 0,
        expectedAdversarialRejection: 5,
        ordinaryFailure: 0,
        unsupportedLocale: 0,
        verified: 15,
      },
      criticalCorrectnessRate: 1,
      criticalPassed: 20,
      criticalTotal: 20,
      ordinaryPassed: 15,
      ordinaryTotal: 15,
      passed: 20,
      total: 20,
    };
    const acceptanceBlockers = [
      "QUALITY_CROSS_REPORT_OVERLAP_NOT_ASSESSED",
      "QUALITY_GLOSSARY_COVERAGE_NOT_ASSESSED",
      "QUALITY_NATIVE_REVIEW_MEAN_BELOW_4_2",
      "QUALITY_NATIVE_REVIEW_MISSING:en-IN",
    ];
    const passingAssessment = rehashAssessment(baseline, {
      artifact: passingArtifact,
      automated: passingAutomated,
      blockers: acceptanceBlockers,
    });
    expect(parseQualityAssessment(passingAssessment).automated.acceptanceRate).toBe(1);

    const adversarialFailureOutcomes = [...passingOutcomes];
    const adversarialIndex = adversarialFailureOutcomes.findIndex(
      (outcome) => outcome.expectedScenario === "adversarial",
    );
    const adversarial = adversarialFailureOutcomes[adversarialIndex];
    expect(adversarial).toBeDefined();
    if (adversarial === undefined) throw new Error("Expected an adversarial evaluation outcome");
    adversarialFailureOutcomes[adversarialIndex] = {
      ...adversarial,
      actualStatus: "verified",
      diagnosticCodes: [],
      outcome: "adversarial_failure",
      reportHash: `sha256:${"f".repeat(64)}`,
    };
    const failureArtifact = rehashArtifact(baseline.artifact, {
      outcomes: adversarialFailureOutcomes,
    });
    const failureAssessment = rehashAssessment(baseline, {
      artifact: failureArtifact,
      automated: {
        ...passingAutomated,
        acceptanceRate: 0.95,
        adversarialPassed: 4,
        counts: {
          ...passingAutomated.counts,
          adversarialFailure: 1,
          expectedAdversarialRejection: 4,
        },
        criticalCorrectnessRate: 0.95,
        criticalPassed: 19,
        passed: 19,
      },
      blockers: [
        "QUALITY_ADVERSARIAL_REJECTION_INVALID",
        "QUALITY_AUTOMATED_ACCEPTANCE_BELOW_98",
        "QUALITY_CRITICAL_CORRECTNESS_BELOW_100",
        ...acceptanceBlockers,
      ].sort(),
    });
    expect(parseQualityAssessment(failureAssessment).automated.counts.adversarialFailure).toBe(1);
  }, 30_000);

  it("normalizes an unexpected public-input failure without leaking the original value", () => {
    const requestedLocales = new Proxy([] as string[], {
      get(target, property, receiver) {
        if (property === "length") throw new Error("synthetic proxy failure");
        return Reflect.get(target, property, receiver);
      },
    });
    expect(() => assessReportQuality({ corpus, release, requestedLocales })).toThrow(
      "QUALITY_EVALUATION_INVALID",
    );
  });
});
