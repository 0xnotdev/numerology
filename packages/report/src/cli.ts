import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createDoctrineRegistry, DoctrineCompileError } from "@numerology/doctrine";
import { calculateFixture, stableStringify } from "@numerology/engine";
import {
  buildCheckpointFourReportFixture,
  CHECKPOINT4_FIXTURE_GENERATED_AT,
} from "./checkpoint4-fixture";
import { planReport } from "./planner";
import { resolvePlannerPolicy } from "./policy";
import { stableReportPlan } from "./serialization";
import { ReportPlanningError, type PlannerPolicy } from "./types";
import { renderReportPlan } from "./viewer";
import { stableStructuredReport } from "./report-serialization";
import { verifyStructuredReport } from "./verification/verifier";
import { stableVerificationRecord } from "./verification/verifier";

export const REPORT_CLI_HELP = `Usage: report synthetic-plan [options]
       report generate --release <compiled.json> [--format json|html] [--output <path>]
                  [--verification-output <path>]
  report verify --release <compiled.json> --report <report.json> [--output <path>]

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

  --help, -h                 Show this help.

Exit codes: 0 success, 1 I/O/unexpected failure, 2 command/argument usage error,
3 invalid fixture, policy, doctrine release, evidence, plan, report, or failed verification.
`;

export interface ReportCliIo {
  readonly read: (path: string) => Promise<string>;
  readonly stderr: (text: string) => void;
  readonly stdout: (text: string) => void;
  readonly write: (path: string, text: string) => Promise<void>;
}

async function atomicWrite(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, text, "utf8");
  await rename(temporary, path);
}

export const NODE_REPORT_CLI_IO: ReportCliIo = {
  read: (path) => readFile(path, "utf8"),
  stderr: (text) => process.stderr.write(text),
  stdout: (text) => process.stdout.write(text),
  write: atomicWrite,
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

async function executeCheckpointFourCommand(parsed: ParsedArgs, io: ReportCliIo): Promise<number> {
  const { flags } = parsed;
  if (parsed.command === "generate") {
    assertOnlyFlags(flags, ["--format", "--output", "--release", "--verification-output"]);
    const format = flags.get("--format") ?? "json";
    if (format !== "json" && format !== "html") {
      throw new UsageError(`Invalid --format ${format}.`);
    }
    if (
      flags.get("--output") !== undefined &&
      flags.get("--output") === flags.get("--verification-output")
    ) {
      throw new UsageError("--output and --verification-output must differ.");
    }
    const release = await readJson(requireFlag(flags, "--release"), io);
    const fixture = buildCheckpointFourReportFixture(release);
    const output = format === "html" ? fixture.html : `${stableStructuredReport(fixture.report)}\n`;
    await emit(output, flags.get("--output"), io);
    const verificationOutput = flags.get("--verification-output");
    if (verificationOutput !== undefined) {
      await emit(`${stableVerificationRecord(fixture.verification)}\n`, verificationOutput, io);
    }
    return 0;
  }

  assertOnlyFlags(flags, ["--output", "--release", "--report"]);
  const release = await readJson(requireFlag(flags, "--release"), io);
  const report = await readJson(requireFlag(flags, "--report"), io);
  const fixture = buildCheckpointFourReportFixture(release);
  const verification = verifyStructuredReport({
    bundle: fixture.bundle,
    evidence: fixture.evidence,
    plan: fixture.plan,
    privateValues: ["1990-08-12", "THOMAS CRUISE MAPOTHER", "CHX"],
    report,
    verifiedAt: CHECKPOINT4_FIXTURE_GENERATED_AT,
  });
  await emit(`${stableStringify(verification)}\n`, flags.get("--output"), io);
  return verification.valid ? 0 : 3;
}

async function execute(parsed: ParsedArgs, io: ReportCliIo): Promise<number> {
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
