import { readFile } from "node:fs/promises";
import { stableStringify } from "@numerology/engine";
import {
  compileDoctrine,
  createDoctrineRegistry,
  validateCompiledDoctrine,
} from "../packages/doctrine/src/index";
import { calculateFixture } from "../packages/numerology/src/index";

const AUTHORING_PATH = "data/doctrine/releases/starter.authoring.json";
const COMPILED_PATH = "data/doctrine/releases/starter.compiled.json";
const MANIFEST_PATH = "data/doctrine/releases/starter.manifest.json";

async function main(): Promise<void> {
  const [authoringText, compiledText, manifestText] = await Promise.all([
    readFile(AUTHORING_PATH, "utf8"),
    readFile(COMPILED_PATH, "utf8"),
    readFile(MANIFEST_PATH, "utf8"),
  ]);
  const authoring = JSON.parse(authoringText) as unknown;
  const committedCompiled = JSON.parse(compiledText) as unknown;
  const compiled = compileDoctrine(authoring);

  if (`${compiled.canonicalJson}\n` !== compiledText) {
    throw new Error(`Deterministic doctrine release drift: regenerate ${COMPILED_PATH}.`);
  }
  if (`${stableStringify(compiled.manifest)}\n` !== manifestText) {
    throw new Error(`Doctrine manifest drift: regenerate ${MANIFEST_PATH}.`);
  }
  if (!validateCompiledDoctrine(committedCompiled).valid) {
    throw new Error("Committed compiled doctrine release failed integrity validation.");
  }
  const evidence = createDoctrineRegistry(committedCompiled).resolve(
    calculateFixture("G-W-LP-001").bundle,
    { asOfDate: "2026-08-31", locale: "en" },
  );
  if (evidence.evidence.length === 0) {
    throw new Error("Committed doctrine release produced no synthetic evidence.");
  }

  process.stdout.write(
    `Doctrine release verified: ${compiled.manifest.doctrine_hash} (${compiled.manifest.rule_count} rule, ${evidence.evidence.length} synthetic match).\n`,
  );
}

void main();
