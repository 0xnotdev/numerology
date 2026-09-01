import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { calculateFixture, stableStringify } from "@numerology/engine";
import { compileDoctrine, validateDoctrine } from "./compiler";
import { REVIEW_STATES, type ReviewState } from "./canonical-rule";
import { DoctrineCompileError } from "./diagnostics";
import { createDoctrineRegistry } from "./registry";
import { renderReviewerView, reviewerRows } from "./reviewer-view";
import { diffCompiledDoctrine } from "./semantic-diff";

export const DOCTRINE_CLI_HELP = `Usage: doctrine <command> [options]

Commands:
  validate        --input <authoring.json>
                  Validates canonical rule schema, references, review, hashes, and semantics.
  compile         --input <authoring.json> --output <compiled.json> --manifest <manifest.json>
                  Emits deterministic canonical compiled JSON and release manifest.
  diff            --before <compiled.json> --after <compiled.json> [--output <diff.json>]
                  Emits a deterministic semantic rule/source/action/binding diff.
  synthetic-plan  --release <compiled.json> --fixture <engine-fixture-id>
                  --locale <locale> --as-of <YYYY-MM-DD> [--output <evidence.json>]
                  Resolves synthetic evidence only; it does not create a report plan.
  review          --input <authoring-or-compiled.json> [--state <review-state>]
                  [--format markdown|json] [--output <viewer-file>]
                  Renders a practical deterministic reviewer queue.

All inputs and machine outputs are UTF-8 JSON. Diagnostics go to stderr. Usage errors exit 2,
invalid releases exit 3, and I/O or unexpected failures exit 1.
`;

export interface DoctrineCliIo {
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

export const NODE_DOCTRINE_CLI_IO: DoctrineCliIo = {
  read: (path) => readFile(path, "utf8"),
  stderr: (text) => process.stderr.write(text),
  stdout: (text) => process.stdout.write(text),
  write: atomicWrite,
};

interface ParsedArgs {
  readonly command: string;
  readonly flags: ReadonlyMap<string, string>;
}

function parseArgs(args: readonly string[]): ParsedArgs {
  const command = args[0];
  if (command === undefined) {
    throw new RangeError("Missing command.");
  }
  const flags = new Map<string, string>();
  for (let index = 1; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (flag === undefined || !flag.startsWith("--") || value === undefined) {
      throw new RangeError(`Invalid option near ${String(flag)}.`);
    }
    if (flags.has(flag)) {
      throw new RangeError(`Duplicate option ${flag}.`);
    }
    flags.set(flag, value);
  }
  return { command, flags };
}

function requireFlag(flags: ReadonlyMap<string, string>, name: string): string {
  const value = flags.get(name);
  if (value === undefined || value.length === 0) {
    throw new RangeError(`${name} is required.`);
  }
  return value;
}

function assertOnlyFlags(flags: ReadonlyMap<string, string>, allowed: readonly string[]): void {
  const allowedSet = new Set(allowed);
  const unknown = [...flags.keys()].filter((flag) => !allowedSet.has(flag)).sort();
  if (unknown.length > 0) {
    throw new RangeError(`Unknown option(s): ${unknown.join(", ")}.`);
  }
}

async function readJson(path: string, io: DoctrineCliIo): Promise<unknown> {
  const text = await io.read(path);
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new SyntaxError(
      `INVALID_JSON ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function emit(text: string, output: string | undefined, io: DoctrineCliIo): Promise<void> {
  if (output === undefined) {
    io.stdout(text);
  } else {
    await io.write(output, text);
  }
}

function jsonLine(value: unknown): string {
  return `${stableStringify(value)}\n`;
}

function isReviewState(value: string): value is ReviewState {
  return (REVIEW_STATES as readonly string[]).includes(value);
}

async function execute(parsed: ParsedArgs, io: DoctrineCliIo): Promise<number> {
  const { command, flags } = parsed;
  if (command === "validate") {
    assertOnlyFlags(flags, ["--input"]);
    const validation = validateDoctrine(await readJson(requireFlag(flags, "--input"), io));
    const output = jsonLine(validation);
    if (validation.valid) {
      io.stdout(output);
      return 0;
    }
    io.stderr(output);
    return 3;
  }
  if (command === "compile") {
    assertOnlyFlags(flags, ["--input", "--manifest", "--output"]);
    const compiled = compileDoctrine(await readJson(requireFlag(flags, "--input"), io));
    await io.write(requireFlag(flags, "--output"), `${compiled.canonicalJson}\n`);
    await io.write(requireFlag(flags, "--manifest"), jsonLine(compiled.manifest));
    return 0;
  }
  if (command === "diff") {
    assertOnlyFlags(flags, ["--after", "--before", "--output"]);
    const before = await readJson(requireFlag(flags, "--before"), io);
    const after = await readJson(requireFlag(flags, "--after"), io);
    await emit(jsonLine(diffCompiledDoctrine(before, after)), flags.get("--output"), io);
    return 0;
  }
  if (command === "synthetic-plan") {
    assertOnlyFlags(flags, ["--as-of", "--fixture", "--locale", "--output", "--release"]);
    const registry = createDoctrineRegistry(await readJson(requireFlag(flags, "--release"), io));
    const fixture = calculateFixture(requireFlag(flags, "--fixture"));
    const resolved = registry.resolve(fixture.bundle, {
      asOfDate: requireFlag(flags, "--as-of"),
      locale: requireFlag(flags, "--locale"),
    });
    await emit(jsonLine(resolved), flags.get("--output"), io);
    return 0;
  }
  if (command === "review") {
    assertOnlyFlags(flags, ["--format", "--input", "--output", "--state"]);
    const input = await readJson(requireFlag(flags, "--input"), io);
    const stateFlag = flags.get("--state");
    if (stateFlag !== undefined && !isReviewState(stateFlag)) {
      throw new RangeError(`Invalid --state ${stateFlag}.`);
    }
    const format = flags.get("--format") ?? "markdown";
    if (format !== "markdown" && format !== "json") {
      throw new RangeError(`Invalid --format ${format}.`);
    }
    const output =
      format === "json"
        ? jsonLine({ rules: reviewerRows(input, stateFlag) })
        : renderReviewerView(input, stateFlag);
    await emit(output, flags.get("--output"), io);
    return 0;
  }
  throw new RangeError(`Unknown command ${command}.`);
}

export async function runDoctrineCli(
  args: readonly string[],
  io: DoctrineCliIo = NODE_DOCTRINE_CLI_IO,
): Promise<number> {
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
    io.stdout(DOCTRINE_CLI_HELP);
    return 0;
  }
  try {
    return await execute(parseArgs(args), io);
  } catch (error) {
    if (error instanceof DoctrineCompileError) {
      io.stderr(jsonLine({ diagnostics: error.diagnostics, valid: false }));
      return 3;
    }
    if (error instanceof RangeError && !error.message.startsWith("INVALID_CALCULATION_BUNDLE")) {
      io.stderr(`${error.message}\n${DOCTRINE_CLI_HELP}`);
      return 2;
    }
    io.stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}
