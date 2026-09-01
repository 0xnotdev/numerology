import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { REPORT_CLI_HELP, runReportCli, type ReportCliIo } from "./cli";

const compiledPath = fileURLToPath(
  new URL("../../../data/doctrine/releases/starter.compiled.json", import.meta.url),
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
