import { lstat, mkdir, mkdtemp, readFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { NODE_REPORT_CLI_IO, REPORT_CLI_HELP, type ReportCliIo, runReportCli } from "./cli";

const compiledPath = fileURLToPath(
  new URL("../../../data/doctrine/releases/starter.compiled.json", import.meta.url),
);
const checkpointFourCompiledPath = fileURLToPath(
  new URL("../../../data/doctrine/releases/checkpoint4-fallback.compiled.json", import.meta.url),
);
const checkpointFourReportPath = fileURLToPath(
  new URL("../../../data/report/fixtures/checkpoint4-report.expected.json", import.meta.url),
);

function argumentsFor(...extra: string[]): string[] {
  return [
    "synthetic-plan",
    "--release",
    "release.json",
    "--fixture",
    "G-W-LP-001",
    "--locale",
    "en",
    "--as-of",
    "2026-08-31",
    "--policy",
    "policy.json",
    ...extra,
  ];
}

function withPolicy(path: string): string[] {
  return argumentsFor().map((value) => (value === "policy.json" ? path : value));
}

async function testIo(files: Readonly<Record<string, string>> = {}) {
  const compiled = await readFile(compiledPath, "utf8");
  const defaultPolicy = JSON.stringify({
    maxRootWordShare: 1,
    maxTimingWordShare: 1,
    minimumIndependentProfileFamilies: 1,
  });
  let stdout = "";
  let stderr = "";
  const writes = new Map<string, string>();
  const io: ReportCliIo = {
    read: async (path) => {
      const value =
        files[path] ??
        (path === "release.json" ? compiled : path === "policy.json" ? defaultPolicy : undefined);
      if (value === undefined) {
        throw new Error(`ENOENT: ${path}`);
      }
      return value;
    },
    stderr: (text) => {
      stderr += text;
    },
    stdout: (text) => {
      stdout += text;
    },
    write: async (path, text) => {
      writes.set(path, text);
    },
  };
  return { io, stderr: () => stderr, stdout: () => stdout, writes };
}

describe("report CLI", () => {
  it.each(["--help", "-h"])("documents arguments and exit codes for %s", async (flag) => {
    const capture = await testIo();
    expect(await runReportCli([flag], capture.io)).toBe(0);
    expect(capture.stdout()).toBe(REPORT_CLI_HELP);
    expect(capture.stdout()).toContain("Exit codes: 0 success");
  });

  it("emits deterministic JSON to an output path", async () => {
    const capture = await testIo();
    const code = await runReportCli(
      argumentsFor("--format", "json", "--output", "out/plan.json"),
      capture.io,
    );

    expect(code).toBe(0);
    expect(capture.stdout()).toBe("");
    expect(capture.stderr()).toBe("");
    expect(JSON.parse(capture.writes.get("out/plan.json") ?? "")).toMatchObject({
      plannerVersion: "plan-2.0.0",
      schemaVersion: "1.0.0",
    });
  });

  it("generates and verifies canonical Checkpoint 4 JSON/HTML with stable operator exits", async () => {
    const release = await readFile(checkpointFourCompiledPath, "utf8");
    const report = await readFile(checkpointFourReportPath, "utf8");
    const generated = await testIo({ "fallback.json": release });
    expect(
      await runReportCli(
        [
          "generate",
          "--release",
          "fallback.json",
          "--output",
          "report.json",
          "--verification-output",
          "verification.json",
        ],
        generated.io,
      ),
    ).toBe(0);
    expect(JSON.parse(generated.writes.get("report.json") ?? "")).toMatchObject({
      reportHash: expect.stringMatching(/^sha256:/u),
      schemaVersion: "1.0.0",
    });
    expect(JSON.parse(generated.writes.get("verification.json") ?? "")).toMatchObject({
      valid: true,
      verifierVersion: "1.0.0",
    });

    const html = await testIo({ "fallback.json": release });
    expect(
      await runReportCli(["generate", "--release", "fallback.json", "--format", "html"], html.io),
    ).toBe(0);
    expect(html.stdout()).toContain("<!doctype html>");
    expect(html.stdout()).toContain("Lo Shu digit occurrence table");

    const verified = await testIo({ "fallback.json": release, "report.json": report });
    expect(
      await runReportCli(
        ["verify", "--release", "fallback.json", "--report", "report.json"],
        verified.io,
      ),
    ).toBe(0);
    expect(JSON.parse(verified.stdout())).toMatchObject({ valid: true });

    const wire = JSON.parse(report) as Record<string, unknown>;
    wire.reportHash = `sha256:${"0".repeat(64)}`;
    const rejected = await testIo({
      "fallback.json": release,
      "report.json": JSON.stringify(wire),
    });
    expect(
      await runReportCli(
        ["verify", "--release", "fallback.json", "--report", "report.json"],
        rejected.io,
      ),
    ).toBe(3);
    expect(JSON.parse(rejected.stdout())).toMatchObject({ valid: false });
  });

  it("rejects symlink outputs and stages paired files before commit", async () => {
    const directory = await mkdtemp(join(tmpdir(), "numerology-report-cli-"));
    const outside = join(directory, "outside");
    const outsideFile = join(outside, "payload.txt");
    const target = join(directory, "target.txt");
    const first = join(directory, "first.txt");
    if (process.platform === "win32") {
      await mkdir(outside);
      await NODE_REPORT_CLI_IO.write(outsideFile, "outside");
      await symlink(outside, target, "junction");
    } else {
      await NODE_REPORT_CLI_IO.write(outsideFile, "outside");
      await symlink(outsideFile, target);
    }
    expect((await lstat(target)).isSymbolicLink()).toBe(true);
    await expect(NODE_REPORT_CLI_IO.write(target, "replacement")).rejects.toThrow(
      "CLI_OUTPUT_SYMLINK",
    );
    await expect(
      NODE_REPORT_CLI_IO.writePair?.([first, "first"], [target, "second"]),
    ).rejects.toThrow("CLI_OUTPUT_SYMLINK");
    await expect(readFile(outsideFile, "utf8")).resolves.toBe("outside");
    await expect(readFile(first, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each([
    [[], "Missing command."],
    [["unknown"], "Unknown command unknown."],
    [argumentsFor("--format", "yaml"), "Invalid --format yaml."],
    [argumentsFor("--unknown", "x"), "Unknown option(s): --unknown."],
    [[...argumentsFor(), "--locale", "en"], "Duplicate option --locale."],
    [["synthetic-plan", "--release"], "Invalid option near --release."],
    [["synthetic-plan", "--release", ""], "--release is required."],
  ] as const)("returns usage exit 2 for malformed arguments", async (args, message) => {
    const capture = await testIo();
    expect(await runReportCli(args, capture.io)).toBe(2);
    expect(capture.stderr()).toContain(message);
    expect(capture.stderr()).toContain("Usage: report synthetic-plan");
  });

  it.each([
    [withPolicy("bad-json.json"), { "bad-json.json": "{" }, "INVALID_JSON"],
    [withPolicy("array.json"), { "array.json": "[]" }, "INVALID_POLICY"],
    [withPolicy("bad-value.json"), { "bad-value.json": '{"maxActions":"x"}' }, "INVALID_POLICY"],
    [withPolicy("unknown.json"), { "unknown.json": '{"unknown":1}' }, "unknown key"],
    [
      argumentsFor().map((value) => (value === "G-W-LP-001" ? "MISSING" : value)),
      {},
      "Unknown fixture",
    ],
    [argumentsFor(), { "release.json": "{}" }, "COMPILED_SCHEMA_INVALID"],
  ] as const)("returns invalid-input exit 3 without output", async (args, files, message) => {
    const capture = await testIo(files);
    expect(await runReportCli(args, capture.io)).toBe(3);
    expect(capture.stdout()).toBe("");
    expect(capture.stderr()).toContain(message);
  });

  it("returns exit 1 for read and write failures", async () => {
    const capture = await testIo();
    expect(await runReportCli(withPolicy("missing.json"), capture.io)).toBe(1);
    expect(capture.stderr()).toContain("ENOENT: missing.json");

    const writeFailure = await testIo();
    const failingWriter: ReportCliIo = {
      ...writeFailure.io,
      write: async () => {
        throw new Error("WRITE_FAILED");
      },
    };
    expect(await runReportCli(argumentsFor("--output", "plan.json"), failingWriter)).toBe(1);
    expect(writeFailure.stderr()).toContain("WRITE_FAILED");

    let nonErrorStderr = "";
    const nonErrorIo: ReportCliIo = {
      ...capture.io,
      read: async () => Promise.reject("NON_ERROR_FAILURE"),
      stderr: (text) => {
        nonErrorStderr += text;
      },
    };
    expect(await runReportCli(argumentsFor(), nonErrorIo)).toBe(1);
    expect(nonErrorStderr).toContain("NON_ERROR_FAILURE");
  });
});
