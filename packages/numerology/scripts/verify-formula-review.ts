import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ENGINE_VERSION } from "../src/types";
import { FORMULA_MANIFEST_HASH, PROFILE_MANIFESTS } from "../src/manifest";
import { stableStringify } from "../src/stable-json";

type ReviewSignoff = {
  readonly artifact: string;
  readonly artifactVersion: string;
  readonly engineVersion: string;
  readonly formulaManifest: {
    readonly manifestHash: string;
    readonly path: string;
    readonly sha256: string;
  };
  readonly reviewedFormulas: Readonly<Record<string, unknown>>;
  readonly review: {
    readonly date: string;
    readonly evidence: readonly string[];
    readonly reviewer: string;
    readonly status: string;
  };
  readonly coveredCode: readonly { readonly path: string; readonly sha256: string }[];
};

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const signoffPath = resolve(packageRoot, "formula-review-signoff.json");
const REVIEWED_CODE_PATHS = [
  "src/alphabets.ts",
  "src/bundle-facts.ts",
  "src/bundle-input.ts",
  "src/bundle-profiles.ts",
  "src/bundle.ts",
  "src/cheiro.ts",
  "src/date.ts",
  "src/johari.ts",
  "src/lo-shu.ts",
  "src/manifest.ts",
  "src/reduction.ts",
] as const;

function fail(message: string): never {
  throw new Error(`Formula review sign-off invalid: ${message}`);
}

function sha256(path: string): string {
  return `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
}

function readSignoff(): ReviewSignoff {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(signoffPath, "utf8"));
  } catch (error) {
    fail(`cannot read ${signoffPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (parsed === null || typeof parsed !== "object") {
    fail("artifact must be an object");
  }
  return parsed as ReviewSignoff;
}

function expectedReviewedFormulas(): Readonly<Record<string, unknown>> {
  return Object.fromEntries(
    Object.entries(PROFILE_MANIFESTS)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([profileId, profile]) => [
        profileId,
        {
          formulaVersion: profileId.endsWith("_v1") ? "v1" : "unversioned",
          metrics: Object.fromEntries(
            Object.entries(profile.metrics)
              .sort(([left], [right]) => left.localeCompare(right))
              .map(([metricId, metric]) => [
                metricId,
                { formula: metric.formula, masters: [...metric.masters], source: metric.source },
              ]),
          ),
        },
      ]),
  );
}

function verify(): void {
  const signoff = readSignoff();
  if (signoff.artifact !== "formula-review-signoff" || signoff.artifactVersion !== "1") {
    fail("artifact identity/version is not supported");
  }
  if (signoff.engineVersion !== ENGINE_VERSION) {
    fail(`engineVersion ${String(signoff.engineVersion)} does not match ${ENGINE_VERSION}`);
  }
  if (
    signoff.review?.status !== "approved" ||
    typeof signoff.review.reviewer !== "string" ||
    signoff.review.reviewer.trim().length === 0 ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(signoff.review.date) ||
    !Array.isArray(signoff.review.evidence) ||
    signoff.review.evidence.length === 0
  ) {
    fail("review status, reviewer, ISO date, and evidence are required");
  }
  if (
    !signoff.formulaManifest ||
    signoff.formulaManifest.manifestHash !== FORMULA_MANIFEST_HASH ||
    typeof signoff.formulaManifest.path !== "string" ||
    typeof signoff.formulaManifest.sha256 !== "string"
  ) {
    fail("formula manifest hash/path does not match the executable manifest");
  }
  if (!Array.isArray(signoff.coveredCode)) {
    fail("coveredCode must be an array");
  }
  const manifestPath = resolve(packageRoot, signoff.formulaManifest.path);
  if (sha256(manifestPath) !== signoff.formulaManifest.sha256) {
    fail(`covered manifest changed: ${signoff.formulaManifest.path}`);
  }
  if (stableStringify(signoff.reviewedFormulas) !== stableStringify(expectedReviewedFormulas())) {
    fail("reviewed formulas do not match the executable manifest");
  }

  const seen = new Set<string>();
  for (const covered of signoff.coveredCode) {
    if (seen.has(covered.path)) {
      fail(`duplicate covered code path: ${covered.path}`);
    }
    seen.add(covered.path);
    const path = resolve(packageRoot, covered.path);
    if (sha256(path) !== covered.sha256) {
      fail(`covered code changed: ${covered.path}`);
    }
  }
  if (
    seen.size !== REVIEWED_CODE_PATHS.length ||
    REVIEWED_CODE_PATHS.some((path) => !seen.has(path))
  ) {
    fail(`coveredCode must enumerate exactly: ${REVIEWED_CODE_PATHS.join(", ")}`);
  }

  console.log(
    `Formula review sign-off verified: ${signoff.review.status} by ${signoff.review.reviewer} ` +
      `(${Object.keys(signoff.reviewedFormulas).length} profiles, ${seen.size} code files).`,
  );
}

verify();
