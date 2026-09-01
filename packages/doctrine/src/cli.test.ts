import { describe, expect, it } from "vitest";
import { runDoctrineCli, type DoctrineCliIo } from "./cli";
import { validAuthoring } from "./test-fixtures";

function memoryIo(initial: Readonly<Record<string, string>> = {}) {
  const files = new Map(Object.entries(initial));
  let stdout = "";
  let stderr = "";
  const io: DoctrineCliIo = {
    read: async (path) => {
      const value = files.get(path);
      if (value === undefined) {
        throw new Error(`ENOENT ${path}`);
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
      files.set(path, text);
    },
  };
  return {
    files,
    io,
    stderr: () => stderr,
    stdout: () => stdout,
  };
}

describe("production doctrine CLI", () => {
  it("validates and compiles deterministic authoring files with explicit outputs", async () => {
    const memory = memoryIo({ "valid.json": JSON.stringify(validAuthoring()) });

    expect(await runDoctrineCli(["validate", "--input", "valid.json"], memory.io)).toBe(0);
    expect(JSON.parse(memory.stdout())).toEqual({ diagnostics: [], valid: true });
    expect(
      await runDoctrineCli(
        [
          "compile",
          "--input",
          "valid.json",
          "--output",
          "compiled.json",
          "--manifest",
          "manifest.json",
        ],
        memory.io,
      ),
    ).toBe(0);
    expect(memory.files.get("compiled.json")).toMatch(/^\{"actions"/u);
    expect(JSON.parse(memory.files.get("manifest.json") ?? "{}")).toMatchObject({
      rule_count: 1,
      source_count: 1,
    });
  });

  it("returns useful nonzero diagnostics for invalid releases and usage", async () => {
    const invalid = { ...validAuthoring(), invented: true };
    const validation = memoryIo({ "invalid.json": JSON.stringify(invalid) });
    expect(await runDoctrineCli(["validate", "--input", "invalid.json"], validation.io)).toBe(3);
    expect(validation.stderr()).toContain("RELEASE_SCHEMA_INVALID");

    const compile = memoryIo({ "invalid.json": JSON.stringify(invalid) });
    expect(
      await runDoctrineCli(
        [
          "compile",
          "--input",
          "invalid.json",
          "--output",
          "out.json",
          "--manifest",
          "manifest.json",
        ],
        compile.io,
      ),
    ).toBe(3);
    expect(compile.files.has("out.json")).toBe(false);

    const usage = memoryIo();
    expect(await runDoctrineCli(["compile", "--unknown", "x"], usage.io)).toBe(2);
    expect(usage.stderr()).toContain("Unknown option");
    expect(usage.stderr()).toContain("Usage: doctrine");
  });

  it("runs semantic diff, synthetic evidence planning, and reviewer views", async () => {
    const compileMemory = memoryIo({ "valid.json": JSON.stringify(validAuthoring()) });
    await runDoctrineCli(
      [
        "compile",
        "--input",
        "valid.json",
        "--output",
        "compiled.json",
        "--manifest",
        "manifest.json",
      ],
      compileMemory.io,
    );
    const compiled = compileMemory.files.get("compiled.json") ?? "";

    const diff = memoryIo({ "a.json": compiled, "b.json": compiled });
    expect(
      await runDoctrineCli(
        ["diff", "--before", "a.json", "--after", "b.json", "--output", "diff.json"],
        diff.io,
      ),
    ).toBe(0);
    expect(JSON.parse(diff.files.get("diff.json") ?? "{}").rules.changed).toEqual([]);

    const synthetic = memoryIo({ "compiled.json": compiled });
    expect(
      await runDoctrineCli(
        [
          "synthetic-plan",
          "--release",
          "compiled.json",
          "--fixture",
          "G-W-LP-001",
          "--locale",
          "en",
          "--as-of",
          "2026-08-31",
        ],
        synthetic.io,
      ),
    ).toBe(0);
    expect(JSON.parse(synthetic.stdout()).evidence[0].ruleId).toBe("RULE_WESTERN_LP_3");

    const review = memoryIo({ "valid.json": JSON.stringify(validAuthoring()) });
    expect(
      await runDoctrineCli(["review", "--input", "valid.json", "--format", "markdown"], review.io),
    ).toBe(0);
    expect(review.stdout()).toContain("RULE_WESTERN_LP_3");
  });

  it("covers malformed JSON, duplicate/missing options, and reviewer option validation", async () => {
    const malformed = memoryIo({ "bad.json": "{" });
    expect(await runDoctrineCli(["validate", "--input", "bad.json"], malformed.io)).toBe(1);
    expect(malformed.stderr()).toContain("INVALID_JSON");

    for (const args of [
      [] as string[],
      ["unknown"],
      ["validate"],
      ["validate", "input", "x"],
      ["validate", "--input", "x", "--input", "y"],
    ]) {
      const usage = memoryIo();
      expect(await runDoctrineCli(args, usage.io)).toBe(2);
      expect(usage.stderr()).toContain("Usage: doctrine");
    }

    const review = memoryIo({ "valid.json": JSON.stringify(validAuthoring()) });
    expect(
      await runDoctrineCli(["review", "--input", "valid.json", "--state", "published"], review.io),
    ).toBe(2);
    expect(
      await runDoctrineCli(["review", "--input", "valid.json", "--format", "html"], review.io),
    ).toBe(2);

    const jsonReview = memoryIo({ "valid.json": JSON.stringify(validAuthoring()) });
    expect(
      await runDoctrineCli(
        [
          "review",
          "--input",
          "valid.json",
          "--state",
          "approved",
          "--format",
          "json",
          "--output",
          "review.json",
        ],
        jsonReview.io,
      ),
    ).toBe(0);
    expect(JSON.parse(jsonReview.files.get("review.json") ?? "{}").rules).toHaveLength(1);
  });

  it("prints help and distinguishes I/O failures", async () => {
    const help = memoryIo();
    expect(await runDoctrineCli(["--help"], help.io)).toBe(0);
    expect(help.stdout()).toContain("synthetic-plan");

    const missing = memoryIo();
    expect(await runDoctrineCli(["validate", "--input", "missing.json"], missing.io)).toBe(1);
    expect(missing.stderr()).toContain("ENOENT");
  });
});
