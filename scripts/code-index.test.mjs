import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { buildIndex, queryIndex } from "./code-index.mjs";

test("indexes contracts and direct references without bodies or excluded trees", () => {
  const root = mkdtempSync(join(tmpdir(), "numerology-index-"));
  try {
    for (const directory of ["packages/example/src", "research", ".treehouse/copy/src"]) {
      mkdirSync(join(root, directory), { recursive: true });
    }
    writeFileSync(
      join(root, "packages/example/src/model.ts"),
      `import type { Input as Bundle } from "@example/engine";
export interface Plan { input: Bundle }
export function makePlan(input: Bundle): Plan { throw new Error("BODY_CANARY"); }
export const schema = makeSchema("INITIALIZER_CANARY");
export const chain = makeSchema({ secret: "CHAIN_CANARY" }).strict();
`,
    );
    writeFileSync(
      join(root, "packages/example/src/model.test.ts"),
      "export type TestOnly = string;",
    );
    writeFileSync(join(root, "research/private.ts"), "export type Private = string;");
    writeFileSync(join(root, ".treehouse/copy/src/old.ts"), "export type Old = string;");
    const index = buildIndex(root);
    assert.deepEqual(index.symbols.map((symbol) => symbol.name).sort(), [
      "Plan",
      "chain",
      "makePlan",
      "schema",
    ]);
    const plan = queryIndex(index, "Plan").matches[0];
    assert.match(plan.signature, /input: Bundle/);
    assert.deepEqual(plan.references, [
      { name: "Bundle", importedFrom: "@example/engine", importedName: "Input" },
    ]);
    const serialized = JSON.stringify(index);
    assert.ok(!serialized.includes("BODY_CANARY"));
    assert.ok(!serialized.includes("INITIALIZER_CANARY"));
    assert.ok(!serialized.includes("CHAIN_CANARY"));
    assert.equal(queryIndex(index, "missing").matches.length, 0);
    assert.equal(queryIndex(index, "Plan").matches.length, 1);
    writeFileSync(join(root, "packages/example/src/new.ts"), "export type Fresh = Plan;");
    assert.equal(queryIndex(buildIndex(root), "Fresh").matches.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
