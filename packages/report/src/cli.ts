import { randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createDoctrineRegistry, DoctrineCompileError } from "@numerology/doctrine";
import { calculateFixture, stableStringify } from "@numerology/engine";
import {
  buildCheckpointFourReportFixture,
  CHECKPOINT4_FIXTURE_GENERATED_AT,
} from "./checkpoint4-fixture";
import { runEvaluationCorpus } from "./evaluation";
import { planReport } from "./planner";
import { resolvePlannerPolicy } from "./policy";
import {
  assessReportQuality,
  buildReportQualityReviewPacket,
  decideRelease,
  QualityInputError,
} from "./quality";
import { stableStructuredReport } from "./report-serialization";
import { stableReportPlan } from "./serialization";
import { type PlannerPolicy, ReportPlanningError } from "./types";
import { stableVerificationRecord, verifyStructuredReport } from "./verification/verifier";
import { renderReportPlan } from "./viewer";

export const REPORT_CLI_HELP = `Usage: report synthetic-plan [options]
       report generate --release <compiled.json> [--format json|html] [--output <path>]
                  [--verification-output <path>]
  report verify --release <compiled.json> --report <report.json> [--output <path>]
  report evaluate --release <compiled.json> --corpus <eval-subjects.json> [--output <path>]
  report quality --release <compiled.json> --corpus <eval-subjects.json>
                 --locales <en-IN[,hi-IN,or-IN]> [--reviews <reviews.json>] [--output <path>]
                 [--review-output <packet.json>]
  report release-decision --request <request.json> [--output <path>]

synthetic-plan required:
  --release <compiled.json>  Compiled @numerology/doctrine release.
  --fixture <id>             Real @numerology/engine synthetic fixture ID.
  --locale <locale>          Doctrine locale (for example, en).
  --as-of <YYYY-MM-DD>       Deterministic doctrine validity date.

synthetic-plan optional:
  --policy <policy.json>     Strict planner policy object; see packages/report/README.md.
  --format <json|markdown>   Canonical machine JSON (default) or reviewer Markdown.
  --output <path>            Atomically write output instead of stdout.

Checkpoint 4 generate/verify use the frozen non-customer report fixture. JSON and verification bytes
are canonical; HTML is escaped and semantic. Writes are atomic.
Quality and release-decision are synthetic operator tools, never customer routes or deployment commands.
Evaluation completion is not release approval. Quality reruns the corpus and requires actual native reviews.

  --help, -h                 Show this help.

Exit codes: 0 success, 1 I/O/unexpected failure, 2 command/argument usage error,
3 invalid fixture, policy, doctrine release, evidence, plan, report, or failed verification;
4 quality or release decision blocked by unmet acceptance gates.
`;

export interface ReportCliIo {
  readonly read: (path: string) => Promise<string>;
  readonly stderr: (text: string) => void;
  readonly stdout: (text: string) => void;
  readonly write: (path: string, text: string) => Promise<void>;
  readonly writePair?: (
    first: readonly [path: string, text: string],
    second: readonly [path: string, text: string],
  ) => Promise<void>;
}

async function assertOutputFile(path: string): Promise<void> {
  try {
    const entry = await lstat(path);
    if (entry.isSymbolicLink()) {
      throw new Error(`CLI_OUTPUT_SYMLINK: ${path}`);
    }
    if (!entry.isFile()) throw new Error(`CLI_OUTPUT_NOT_FILE: ${path}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

function sameOutputPath(first: string | undefined, second: string | undefined): boolean {
  if (first === undefined || second === undefined) return false;
  const left = resolve(first);
  const right = resolve(second);
  return process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right;
}

async function stage(path: string, text: string): Promise<string> {
  await assertOutputFile(path);
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`;
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(text, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  return temporary;
}

async function atomicWrite(path: string, text: string): Promise<void> {
  const temporary = await stage(path, text);
  try {
    await rename(temporary, path);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

async function atomicWritePair(
  first: readonly [path: string, text: string],
  second: readonly [path: string, text: string],
): Promise<void> {
  if (sameOutputPath(first[0], second[0])) throw new Error("CLI_OUTPUT_PATHS_MUST_DIFFER");
  const entries = [first, second];
  const temporary: string[] = [];
  const backups: Array<string | undefined> = [];
  const installed: boolean[] = [];
  try {
    for (const [path, text] of entries) temporary.push(await stage(path, text));
    for (const [path] of entries) {
      try {
        await lstat(path);
        const backup = `${path}.bak-${process.pid}-${randomUUID()}`;
        await rename(path, backup);
        backups.push(backup);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") backups.push(undefined);
        else throw error;
      }
    }
    for (const [index, [path]] of entries.entries()) {
      await rename(temporary[index] as string, path);
      installed[index] = true;
    }
  } catch (error) {
    for (const [index, [path]] of entries.entries()) {
      if (installed[index]) await unlink(path).catch(() => undefined);
      const backup = backups[index];
      if (backup !== undefined) await rename(backup, path).catch(() => undefined);
    }
    await Promise.all(temporary.map((path) => unlink(path).catch(() => undefined)));
    throw error;
  }
  await Promise.all(backups.map((path) => (path === undefined ? undefined : unlink(path))));
}

export const NODE_REPORT_CLI_IO: ReportCliIo = {
  read: (path) => readFile(path, "utf8"),
  stderr: (text) => process.stderr.write(text),
  stdout: (text) => process.stdout.write(text),
  write: atomicWrite,
  writePair: atomicWritePair,
};

class UsageError extends Error {}
class InvalidInputError extends Error {}

interface ParsedArgs {
  readonly command: string;
  readonly flags: ReadonlyMap<string, string>;
}

function parseArgs(args: readonly string[]): ParsedArgs {
  const command = args[0];
  if (command === undefined) {
    throw new UsageError("Missing command.");
  }
  const flags = new Map<string, string>();
  for (let index = 1; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (flag === undefined || !flag.startsWith("--") || value === undefined) {
      throw new UsageError(`Invalid option near ${String(flag)}.`);
    }
    if (flags.has(flag)) {
      throw new UsageError(`Duplicate option ${flag}.`);
    }
    flags.set(flag, value);
  }
  return { command, flags };
}

function requireFlag(flags: ReadonlyMap<string, string>, name: string): string {
  const value = flags.get(name);
  if (value === undefined || value.length === 0) {
    throw new UsageError(`${name} is required.`);
  }
  return value;
}

function assertOnlyFlags(flags: ReadonlyMap<string, string>, allowed: readonly string[]): void {
  const allowedSet = new Set(allowed);
  const unknown = [...flags.keys()].filter((flag) => !allowedSet.has(flag)).sort();
  if (unknown.length > 0) {
    throw new UsageError(`Unknown option(s): ${unknown.join(", ")}.`);
  }
}

async function readJson(path: string, io: ReportCliIo): Promise<unknown> {
  const text = await io.read(path);
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new InvalidInputError(
      `INVALID_JSON ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

interface MutablePolicy {
  maxActions?: number;
  maxClaimsPerTheme?: number;
  maxRootWordShare?: number;
  maxTimingWordShare?: number;
  minimumIndependentProfileFamilies?: number;
}

function parsePolicy(input: unknown): PlannerPolicy {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new InvalidInputError("INVALID_POLICY: object required.");
  }
  const policy: MutablePolicy = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value !== "number") {
      throw new InvalidInputError(`INVALID_POLICY: ${key} must be a number.`);
    }
    switch (key) {
      case "maxActions":
        policy.maxActions = value;
        break;
      case "maxClaimsPerTheme":
        policy.maxClaimsPerTheme = value;
        break;
      case "maxRootWordShare":
        policy.maxRootWordShare = value;
        break;
      case "maxTimingWordShare":
        policy.maxTimingWordShare = value;
        break;
      case "minimumIndependentProfileFamilies":
        policy.minimumIndependentProfileFamilies = value;
        break;
      default:
        throw new InvalidInputError(`INVALID_POLICY: unknown key ${key}.`);
    }
  }
  try {
    resolvePlannerPolicy(policy);
  } catch (error) {
    throw new InvalidInputError(error instanceof Error ? error.message : String(error));
  }
  return policy;
}

async function emit(text: string, output: string | undefined, io: ReportCliIo): Promise<void> {
  if (output === undefined) {
    io.stdout(text);
  } else {
    await io.write(output, text);
  }
}

async function emitPair(
  first: readonly [path: string, text: string],
  second: readonly [path: string, text: string],
  io: ReportCliIo,
): Promise<void> {
  if (io.writePair === undefined) {
    await io.write(first[0], first[1]);
    await io.write(second[0], second[1]);
  } else {
    await io.writePair(first, second);
  }
}

async function executeCheckpointFourCommand(parsed: ParsedArgs, io: ReportCliIo): Promise<number> {
  const { flags } = parsed;
  if (parsed.command === "generate") {
    assertOnlyFlags(flags, ["--format", "--output", "--release", "--verification-output"]);
    const format = flags.get("--format") ?? "json";
    if (format !== "json" && format !== "html") {
      throw new UsageError(`Invalid --format ${format}.`);
    }
    if (sameOutputPath(flags.get("--output"), flags.get("--verification-output"))) {
      throw new UsageError("--output and --verification-output must differ.");
    }
    const release = await readJson(requireFlag(flags, "--release"), io);
    const fixture = buildCheckpointFourReportFixture(release);
    const output = format === "html" ? fixture.html : `${stableStructuredReport(fixture.report)}\n`;
    const outputPath = flags.get("--output");
    const verificationOutput = flags.get("--verification-output");
    const verificationText =
      verificationOutput === undefined
        ? undefined
        : `${stableVerificationRecord(fixture.verification)}\n`;
    if (
      outputPath !== undefined &&
      verificationOutput !== undefined &&
      verificationText !== undefined
    ) {
      await emitPair([outputPath, output], [verificationOutput, verificationText], io);
    } else {
      await emit(output, outputPath, io);
      if (verificationOutput !== undefined && verificationText !== undefined) {
        await emit(verificationText, verificationOutput, io);
      }
    }
    return 0;
  }

  assertOnlyFlags(flags, ["--output", "--release", "--report"]);
  const release = await readJson(requireFlag(flags, "--release"), io);
  const report = await readJson(requireFlag(flags, "--report"), io);
  const fixture = buildCheckpointFourReportFixture(release);
  const verification = verifyStructuredReport({
    bundle: fixture.bundle,
    comparisonReports: [],
    evidence: fixture.evidence,
    plan: fixture.plan,
    privateValues: ["1990-08-12", "THOMAS CRUISE MAPOTHER", "CHX"],
    report,
    restrictedSourceTexts: [
      "An independent synthetic comparison passage is kept outside the report.",
    ],
    verifiedAt: CHECKPOINT4_FIXTURE_GENERATED_AT,
  });
  await emit(`${stableStringify(verification)}\n`, flags.get("--output"), io);
  return verification.valid ? 0 : 3;
}

async function execute(parsed: ParsedArgs, io: ReportCliIo): Promise<number> {
  if (parsed.command === "quality" || parsed.command === "release-decision") {
    return executeQualityCommand(parsed, io);
  }
  if (parsed.command === "evaluate") {
    assertOnlyFlags(parsed.flags, ["--corpus", "--output", "--release"]);
    const results = runEvaluationCorpus(
      await readJson(requireFlag(parsed.flags, "--corpus"), io),
      await readJson(requireFlag(parsed.flags, "--release"), io),
    );
    await emit(`${stableStringify(results)}\n`, parsed.flags.get("--output"), io);
    return 0;
  }
  if (parsed.command === "generate" || parsed.command === "verify") {
    try {
      return await executeCheckpointFourCommand(parsed, io);
    } catch (error) {
      if (error instanceof UsageError || error instanceof InvalidInputError) {
        throw error;
      }
      if (error instanceof DoctrineCompileError || error instanceof RangeError) {
        throw new InvalidInputError(error.message);
      }
      throw error;
    }
  }
  if (parsed.command !== "synthetic-plan") {
    throw new UsageError(`Unknown command ${parsed.command}.`);
  }
  const { flags } = parsed;
  assertOnlyFlags(flags, [
    "--as-of",
    "--fixture",
    "--format",
    "--locale",
    "--output",
    "--policy",
    "--release",
  ]);
  const format = flags.get("--format") ?? "json";
  if (format !== "json" && format !== "markdown") {
    throw new UsageError(`Invalid --format ${format}.`);
  }
  const release = await readJson(requireFlag(flags, "--release"), io);
  const policyPath = flags.get("--policy");
  const policy = policyPath === undefined ? undefined : parsePolicy(await readJson(policyPath, io));
  try {
    const fixture = calculateFixture(requireFlag(flags, "--fixture"));
    const evidence = createDoctrineRegistry(release).resolve(fixture.bundle, {
      asOfDate: requireFlag(flags, "--as-of"),
      locale: requireFlag(flags, "--locale"),
    });
    const plan = planReport(fixture.bundle, evidence, policy);
    const output = format === "json" ? `${stableReportPlan(plan)}\n` : renderReportPlan(plan);
    await emit(output, flags.get("--output"), io);
    return 0;
  } catch (error) {
    if (
      error instanceof ReportPlanningError ||
      error instanceof DoctrineCompileError ||
      error instanceof RangeError
    ) {
      throw new InvalidInputError(error.message);
    }
    throw error;
  }
}

async function executeQualityCommand(parsed: ParsedArgs, io: ReportCliIo): Promise<number> {
  const { flags } = parsed;
  if (parsed.command === "release-decision") {
    assertOnlyFlags(flags, ["--request", "--output"]);
    const request = await readJson(requireFlag(flags, "--request"), io);
    let decision: ReturnType<typeof decideRelease>;
    try {
      decision = decideRelease(request);
    } catch (error) {
      if (error instanceof QualityInputError) {
        throw new InvalidInputError("INVALID_RELEASE_DECISION_INPUT");
      }
      throw error;
    }
    await emit(`${stableStringify(decision)}\n`, flags.get("--output"), io);
    return decision.eligible ? 0 : 4;
  }
  assertOnlyFlags(flags, [
    "--corpus",
    "--release",
    "--locales",
    "--reviews",
    "--output",
    "--review-output",
  ]);
  const outputPath = flags.get("--output");
  const reviewOutputPath = flags.get("--review-output");
  if (sameOutputPath(reviewOutputPath, outputPath)) {
    throw new UsageError("--output and --review-output must differ.");
  }
  const corpusPath = requireFlag(flags, "--corpus");
  const releasePath = requireFlag(flags, "--release");
  // The policy validates locale values and duplicates; a missing flag is a usage error.
  if (!flags.has("--locales")) throw new UsageError("--locales is required.");
  const requestedLocales = (flags.get("--locales") as string).split(",");
  const corpus = await readJson(corpusPath, io);
  const release = await readJson(releasePath, io);
  const reviewPath = flags.get("--reviews");
  const reviews = reviewPath === undefined ? undefined : await readJson(reviewPath, io);
  let assessment: ReturnType<typeof assessReportQuality>;
  let packet: ReturnType<typeof buildReportQualityReviewPacket> | undefined;
  try {
    assessment = assessReportQuality({ corpus, release, requestedLocales, reviews });
    if (reviewOutputPath !== undefined) {
      packet = buildReportQualityReviewPacket({ corpus, release, requestedLocales });
    }
  } catch (error) {
    // Do not echo malformed synthetic input or arbitrary review prose into operator logs.
    if (error instanceof QualityInputError) throw new InvalidInputError("INVALID_QUALITY_INPUT");
    throw error;
  }
  const text = `${stableStringify(assessment)}\n`;
  if (packet !== undefined && reviewOutputPath !== undefined) {
    const packetText = `${stableStringify(packet)}\n`;
    if (outputPath !== undefined) {
      await emitPair([outputPath, text], [reviewOutputPath, packetText], io);
    } else {
      await emit(packetText, reviewOutputPath, io);
      await emit(text, undefined, io);
    }
  } else {
    await emit(text, outputPath, io);
  }
  return assessment.eligible ? 0 : 4;
}

export async function runReportCli(
  args: readonly string[],
  io: ReportCliIo = NODE_REPORT_CLI_IO,
): Promise<number> {
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
    io.stdout(REPORT_CLI_HELP);
    return 0;
  }
  try {
    return await execute(parseArgs(args), io);
  } catch (error) {
    if (error instanceof UsageError) {
      io.stderr(`${error.message}\n${REPORT_CLI_HELP}`);
      return 2;
    }
    if (error instanceof InvalidInputError) {
      io.stderr(`${error.message}\n`);
      return 3;
    }
    io.stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}
