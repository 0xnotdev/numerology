import { readFile } from "node:fs/promises";
import { stableStringify } from "@numerology/engine";
import { describe, expect, it } from "vitest";
import { compileDoctrine, validateCompiledDoctrine, validateDoctrine } from "./compiler";

const dataUrl = (path: string) => new URL(`../../../data/doctrine/${path}`, import.meta.url);

describe("committed doctrine release fixtures", () => {
  it("rebuilds the committed release and manifest byte-for-byte", async () => {
    const [authoringText, compiledText, manifestText] = await Promise.all([
      readFile(dataUrl("releases/starter.authoring.json"), "utf8"),
      readFile(dataUrl("releases/starter.compiled.json"), "utf8"),
      readFile(dataUrl("releases/starter.manifest.json"), "utf8"),
    ]);

    const rebuilt = compileDoctrine(JSON.parse(authoringText));

    expect(`${rebuilt.canonicalJson}\n`).toBe(compiledText);
    expect(`${stableStringify(rebuilt.manifest)}\n`).toBe(manifestText);
    expect(validateCompiledDoctrine(JSON.parse(compiledText))).toEqual({
      diagnostics: [],
      valid: true,
    });
  });

  it("keeps valid and intentionally invalid editorial fixtures executable", async () => {
    const [validText, invalidText] = await Promise.all([
      readFile(dataUrl("fixtures/valid-release.json"), "utf8"),
      readFile(dataUrl("fixtures/invalid-release.json"), "utf8"),
    ]);
    expect(validateDoctrine(JSON.parse(validText))).toEqual({ diagnostics: [], valid: true });
    const invalid = validateDoctrine(JSON.parse(invalidText));
    expect(invalid.valid).toBe(false);
    expect(invalid.diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "ACTIVE_RULE_NOT_APPROVED",
        "CONTENT_HASH_MISMATCH",
        "INSUFFICIENT_REVIEWERS",
      ]),
    );
  });
});
