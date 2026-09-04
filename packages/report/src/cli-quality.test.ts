import { lstat, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import release from "@numerology/doctrine-data/doctrine/checkpoint4-fallback.compiled.json";
import corpus from "@numerology/doctrine-data/report/eval-subjects.json";
import { afterEach, describe, expect, it } from "vitest";
import { NODE_REPORT_CLI_IO, type ReportCliIo, runReportCli } from "./cli";

const temporaryDirectories: string[] = [];
afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0)) {
    const resolved = resolve(directory);
    if (!resolved.startsWith(resolve(tmpdir(), "numerology-cp7-cli-"))) {
      throw new Error("Refusing cleanup outside the allocated test directory prefix");
    }
    await rm(resolved, { recursive: true, force: true });
  }
});

async function temporaryDirectory() {
  const directory = await mkdtemp(join(tmpdir(), "numerology-cp7-cli-"));
  temporaryDirectories.push(directory);
  return directory;
}

function capture(files: Readonly<Record<string, unknown>> = {}) {
  let stdout = "";
  let stderr = "";
  const writes = new Map<string, string>();
  const inputs: Readonly<Record<string, unknown>> = { corpus, release, ...files };
  const io: ReportCliIo = {
    read: async (path) => {
      if (!(path in inputs)) throw new Error("ENOENT: synthetic input not found");
      const value = inputs[path];
      return typeof value === "string" ? value : JSON.stringify(value);
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

function qualityArgs(...extra: string[]) {
  return ["quality", "--release", "release", "--corpus", "corpus", "--locales", "en-IN", ...extra];
}

describe("synthetic quality operator CLI", () => {
  it("returns a distinct blocked exit and reproducible artifact instead of claiming launch success", async () => {
    const first = capture();
    expect(await runReportCli(qualityArgs(), first.io)).toBe(4);
    expect(JSON.parse(first.stdout())).toMatchObject({ eligible: false });
    expect(first.stderr()).toBe("");
    const second = capture();
    expect(await runReportCli(qualityArgs("--output", "assessment.json"), second.io)).toBe(4);
    expect(second.writes.get("assessment.json")).toBe(first.stdout());
    expect(second.stdout()).toBe("");
  });

  it.each([
    ["", 3],
    ["fr-FR", 3],
    ["en-IN,en-IN", 3],
  ])(
    "rejects invalid requested locales %j without emitting an assessment",
    async (locales, exit) => {
      const output = capture();
      const args = qualityArgs();
      args[args.length - 1] = String(locales);
      expect(await runReportCli(args, output.io)).toBe(exit);
      expect(output.stdout()).toBe("");
      expect(output.writes.size).toBe(0);
    },
  );

  it.each([{ corpus: [] }, { release: {} }, { corpus: "not-json" }])(
    "rejects malformed evaluation inputs without a success artifact: %j",
    async (files) => {
      const output = capture(files);
      expect(await runReportCli(qualityArgs(), output.io)).toBe(3);
      expect(output.stdout()).toBe("");
    },
  );

  it("does not silently discard invalid native reviews", async () => {
    const output = capture({ reviews: [{ inventedApproval: true }] });
    expect(await runReportCli(qualityArgs("--reviews", "reviews"), output.io)).toBe(3);
    expect(output.stdout()).toBe("");
  });

  it("preserves usage and filesystem failure exits", async () => {
    const output = capture();
    expect(await runReportCli(["quality"], output.io)).toBe(2);
    expect(await runReportCli(qualityArgs("--paid", "true"), output.io)).toBe(2);
    expect(await runReportCli(qualityArgs("--reviews", "missing"), output.io)).toBe(1);
    expect(await runReportCli(qualityArgs().slice(0, -2), output.io)).toBe(2);
    expect(await runReportCli(["release-decision"], output.io)).toBe(2);
    expect(await runReportCli(["release-decision", "--request", "missing"], output.io)).toBe(1);
  });

  it("rejects invented release approvals at the public operator interface", async () => {
    const output = capture({ request: { action: "promote", eligible: true } });
    expect(await runReportCli(["release-decision", "--request", "request"], output.io)).toBe(3);
    expect(output.stdout()).toBe("");
    expect(output.writes.size).toBe(0);
  });

  it("reassesses promotion and refuses rollback without an eligible history", async () => {
    const evaluated = capture();
    expect(await runReportCli(qualityArgs(), evaluated.io)).toBe(4);
    const assessment = JSON.parse(evaluated.stdout());
    for (const action of ["promote", "rollback"]) {
      const output = capture({
        request: {
          action,
          corpus,
          release,
          requestedLocales: ["en-IN"],
          target: { artifactHash: assessment.artifact.artifactHash, locales: ["en-IN"] },
          history: [],
        },
      });
      expect(
        await runReportCli(
          ["release-decision", "--request", "request", "--output", "decision.json"],
          output.io,
        ),
      ).toBe(4);
      expect(JSON.parse(output.writes.get("decision.json") ?? "")).toMatchObject({
        eligible: false,
        selectedArtifactHash: null,
      });
      expect(output.stdout()).toBe("");
    }
  });

  it("can read its own canonical history but cannot turn a blocked assessment into approval", async () => {
    const evaluated = capture();
    expect(await runReportCli(qualityArgs(), evaluated.io)).toBe(4);
    const assessment = JSON.parse(evaluated.stdout());
    const output = capture({
      request: {
        action: "rollback",
        corpus,
        release,
        requestedLocales: ["en-IN"],
        target: { artifactHash: assessment.artifact.artifactHash, locales: ["en-IN"] },
        history: [{ approved: true, artifact: assessment.artifact, assessment }],
      },
    });
    expect(await runReportCli(["release-decision", "--request", "request"], output.io)).toBe(4);
    expect(JSON.parse(output.stdout())).toMatchObject({
      action: "blocked",
      eligible: false,
      selectedArtifactHash: null,
    });
    expect(output.stderr()).toBe("");
  });

  it("exports only verified ordinary synthetic reports for matching native review", async () => {
    const output = capture();
    expect(
      await runReportCli(
        qualityArgs("--output", "assessment.json", "--review-output", "packet.json"),
        output.io,
      ),
    ).toBe(4);
    const assessment = JSON.parse(output.writes.get("assessment.json") ?? "");
    const packet = JSON.parse(output.writes.get("packet.json") ?? "");
    expect(packet.artifactHash).toBe(assessment.artifact.artifactHash);
    expect(packet.reports).toHaveLength(7);
    expect(packet.reports.map((entry: { subjectId: string }) => entry.subjectId)).toEqual([
      "SYN-EN-001",
      "SYN-EN-002",
      "SYN-EN-008",
      "SYN-EN-009",
      "SYN-EN-010",
      "SYN-EN-013",
      "SYN-EN-015",
    ]);
    expect(output.stdout()).toBe("");
  });

  it("does not overwrite an assessment with a review packet at the same path", async () => {
    const output = capture();
    expect(
      await runReportCli(
        qualityArgs("--output", "shared.json", "--review-output", "shared.json"),
        output.io,
      ),
    ).toBe(2);
    expect(output.writes.size).toBe(0);
  });

  it("can write the reviewer packet while sending the assessment to stdout", async () => {
    const output = capture();
    expect(await runReportCli(qualityArgs("--review-output", "packet.json"), output.io)).toBe(4);
    const assessment = JSON.parse(output.stdout());
    expect(JSON.parse(output.writes.get("packet.json") ?? "")).toMatchObject({
      artifactHash: assessment.artifact.artifactHash,
      requestedLocales: ["en-IN"],
    });
  });

  it("reports an output failure as I/O rather than a quality decision", async () => {
    const output = capture();
    expect(
      await runReportCli(qualityArgs("--output", "assessment.json"), {
        ...output.io,
        write: async () => {
          throw new Error("EACCES: output not writable");
        },
      }),
    ).toBe(1);
    expect(output.stdout()).toBe("");
    expect(output.stderr()).toContain("EACCES");
  });

  it("atomically creates and replaces a real assessment/reviewer packet pair", async () => {
    const directory = await temporaryDirectory();
    const output = capture();
    const io: ReportCliIo = {
      ...NODE_REPORT_CLI_IO,
      read: output.io.read,
      stdout: output.io.stdout,
      stderr: output.io.stderr,
    };
    const assessmentPath = join(directory, "assessment.json");
    const packetPath = join(directory, "packet.json");
    const args = qualityArgs("--output", assessmentPath, "--review-output", packetPath);
    expect(await runReportCli(args, io)).toBe(4);
    const first = await readFile(assessmentPath, "utf8");
    expect(JSON.parse(await readFile(packetPath, "utf8")).artifactHash).toBe(
      JSON.parse(first).artifact.artifactHash,
    );
    expect(await runReportCli(args, io)).toBe(4);
    expect(await readFile(assessmentPath, "utf8")).toBe(first);
  });

  it("preserves a previous assessment when the paired target is a directory", async () => {
    const directory = await temporaryDirectory();
    const output = capture();
    const io: ReportCliIo = {
      ...NODE_REPORT_CLI_IO,
      read: output.io.read,
      stdout: output.io.stdout,
      stderr: output.io.stderr,
    };
    const assessmentPath = join(directory, "assessment.json");
    const packetDirectory = join(directory, "packet-directory");
    await NODE_REPORT_CLI_IO.write(assessmentPath, "previous assessment");
    await mkdir(packetDirectory);
    expect(
      await runReportCli(
        qualityArgs("--output", assessmentPath, "--review-output", packetDirectory),
        io,
      ),
    ).toBe(1);
    expect((await readFile(assessmentPath, "utf8")) === "previous assessment").toBe(true);
    expect((await lstat(packetDirectory)).isDirectory()).toBe(true);
  });

  it("rejects equivalent output paths before writing any artifact", async () => {
    const directory = await temporaryDirectory();
    const output = capture();
    const path = join(directory, "assessment.json");
    const alias = `${directory}/./assessment.json`;
    expect(
      await runReportCli(qualityArgs("--output", path, "--review-output", alias), output.io),
    ).toBe(2);
    expect(output.writes.size).toBe(0);
  });
});
