import { readFile, writeFile } from "node:fs/promises";
import { compileDoctrine } from "@numerology/doctrine";
import { stableStringify } from "@numerology/engine";
import { buildCheckpointFourReportFixture } from "@numerology/report";

const ROOT = new URL("../data/", import.meta.url);
const AUTHORING = new URL("doctrine/releases/checkpoint4-fallback.authoring.json", ROOT);
const COMPILED = new URL("doctrine/releases/checkpoint4-fallback.compiled.json", ROOT);
const MANIFEST = new URL("doctrine/releases/checkpoint4-fallback.manifest.json", ROOT);
const EXPECTED = new Map<string, URL>([
  ["bundle", new URL("report/fixtures/checkpoint4-bundle.expected.json", ROOT)],
  ["evidence", new URL("report/fixtures/checkpoint4-evidence.expected.json", ROOT)],
  ["plan", new URL("report/fixtures/checkpoint4-plan.expected.json", ROOT)],
  ["report", new URL("report/fixtures/checkpoint4-report.expected.json", ROOT)],
  ["verification", new URL("report/fixtures/checkpoint4-verification.expected.json", ROOT)],
  ["html", new URL("report/fixtures/checkpoint4-reader.expected.html", ROOT)],
]);

async function json(url: URL): Promise<unknown> {
  return JSON.parse(await readFile(url, "utf8")) as unknown;
}

function expectedOutputs(fixture: ReturnType<typeof buildCheckpointFourReportFixture>) {
  return new Map<string, string>([
    ["bundle", `${stableStringify(fixture.bundle)}\n`],
    ["evidence", `${stableStringify(fixture.evidence)}\n`],
    ["plan", `${stableStringify(fixture.plan)}\n`],
    ["report", `${stableStringify(fixture.report)}\n`],
    ["verification", `${stableStringify(fixture.verification)}\n`],
    ["html", fixture.html],
  ]);
}

async function main(): Promise<void> {
  const authoring = await json(AUTHORING);
  const committedCompiled = await readFile(COMPILED, "utf8");
  const committedManifest = await readFile(MANIFEST, "utf8");
  const rebuilt = compileDoctrine(authoring);
  if (committedCompiled !== `${rebuilt.canonicalJson}\n`) {
    throw new Error("CHECKPOINT4_COMPILED_RELEASE_DRIFT");
  }
  if (committedManifest !== `${stableStringify(rebuilt.manifest)}\n`) {
    throw new Error("CHECKPOINT4_RELEASE_MANIFEST_DRIFT");
  }

  const fixture = buildCheckpointFourReportFixture(rebuilt.release);
  const outputs = expectedOutputs(fixture);
  const write = process.argv.includes("--write");
  for (const [name, url] of EXPECTED) {
    const output = outputs.get(name);
    if (output === undefined) {
      throw new Error(`CHECKPOINT4_EXPECTED_OUTPUT_MISSING: ${name}`);
    }
    if (write) {
      await writeFile(url, output, "utf8");
      continue;
    }
    const committed = await readFile(url, "utf8");
    if (committed !== output) {
      throw new Error(`CHECKPOINT4_GOLDEN_DRIFT: ${name}`);
    }
  }
  process.stdout.write(
    `Checkpoint 4 fixture verified: ${fixture.plan.claims.length} claims, ${fixture.report.sections.length} sections, ${fixture.verification.gates.length} gates, ${fixture.report.reportHash}.\n`,
  );
}

void main();
