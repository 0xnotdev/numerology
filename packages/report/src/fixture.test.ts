import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runReportCli, type ReportCliIo } from "./cli";

const fixtureRoot = fileURLToPath(new URL("../../../data/report/fixtures/", import.meta.url));
const doctrineRoot = fileURLToPath(new URL("../../../data/doctrine/releases/", import.meta.url));

function paths(format: "json" | "markdown") {
  return [
    "synthetic-plan",
    "--release",
    `${doctrineRoot}starter.compiled.json`,
    "--fixture",
    "G-W-LP-001",
    "--locale",
    "en",
    "--as-of",
    "2026-08-31",
    "--policy",
    `${fixtureRoot}valid-policy.json`,
    "--format",
    format,
  ];
}

function memoryIo() {
  let stdout = "";
  let stderr = "";
  const writes = new Map<string, string>();
  const io: ReportCliIo = {
    read: (path) => readFile(path, "utf8"),
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

describe("committed report fixtures", () => {
  it.each(["json", "markdown"] as const)(
    "rebuilds the %s synthetic plan byte-for-byte",
    async (format) => {
      const capture = memoryIo();
      const code = await runReportCli(paths(format), capture.io);
      const expected = await readFile(
        `${fixtureRoot}starter-plan.expected.${format === "json" ? "json" : "md"}`,
        "utf8",
      );

      expect(code).toBe(0);
      expect(capture.stderr()).toBe("");
      expect(capture.stdout()).toBe(expected);
    },
  );

  it("rejects the committed invalid policy fixture without producing a plan", async () => {
    const capture = memoryIo();
    const args = paths("json").map((value) =>
      value === `${fixtureRoot}valid-policy.json` ? `${fixtureRoot}invalid-policy.json` : value,
    );
    const code = await runReportCli(args, capture.io);

    expect(code).toBe(3);
    expect(capture.stdout()).toBe("");
    expect(capture.stderr()).toContain("INVALID_POLICY");
  });
});
