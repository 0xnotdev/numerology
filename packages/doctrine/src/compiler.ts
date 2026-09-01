import { PROFILE_IDS, canonicalHash, stableStringify, type ProfileId } from "@numerology/engine";
import { deepFreeze } from "@numerology/shared";
import { CANONICAL_RULE_SCHEMA_HASH } from "./canonical-rule";
import { withComputedRuleContentHash } from "./content-hash";
import type { DoctrineDiagnostic, DoctrineValidationResult } from "./diagnostics";
import { compareText, DoctrineCompileError, freezeDiagnostics } from "./diagnostics";
import { buildDoctrineIndex } from "./indexer";
import { normalizeAuthoringRelease, sortedUnique } from "./normalization";
import {
  type CompiledDoctrine,
  type CompiledDoctrineRelease,
  type DoctrineAuthoringRelease,
  type DoctrineReleaseManifest,
  parseDoctrineAuthoringRelease,
} from "./release-model";
import { semanticDiagnostics } from "./semantic-validation";

const PROFILE_ID_SET = new Set<string>(PROFILE_IDS);
const AUTHORING_KEYS = Object.freeze([
  "actions",
  "bindings",
  "contradictions",
  "locales",
  "release_id",
  "released_on",
  "rules",
  "schema_version",
  "sources",
]);
const COMPILED_KEYS = Object.freeze([...AUTHORING_KEYS, "index", "release_hash"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sameKeys(input: Record<string, unknown>, expected: readonly string[]): boolean {
  return (
    Object.keys(input).sort(compareText).join("\u0000") ===
    [...expected].sort(compareText).join("\u0000")
  );
}

function authoringFromRecord(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(AUTHORING_KEYS.map((key) => [key, input[key]]));
}

export function validateDoctrine(input: unknown): DoctrineValidationResult {
  const parsed = parseDoctrineAuthoringRelease(input);
  if (parsed.value === undefined) {
    return deepFreeze({ diagnostics: parsed.diagnostics, valid: false });
  }
  const diagnostics = semanticDiagnostics(parsed.value);
  return deepFreeze({ diagnostics, valid: diagnostics.length === 0 });
}

function normalizedForCompilation(input: DoctrineAuthoringRelease): DoctrineAuthoringRelease {
  const normalized = normalizeAuthoringRelease(input);
  return {
    ...normalized,
    rules: normalized.rules.map(withComputedRuleContentHash),
  };
}

function releaseContent(
  input: DoctrineAuthoringRelease,
): Omit<CompiledDoctrineRelease, "release_hash"> {
  return { ...input, index: buildDoctrineIndex(input.rules) };
}

function isProfileId(value: string): value is ProfileId {
  return PROFILE_ID_SET.has(value);
}

function buildManifest(release: CompiledDoctrineRelease): DoctrineReleaseManifest {
  const profileIds = sortedUnique(release.rules.map((rule) => rule.profile_id)).filter(isProfileId);
  return {
    action_count: release.actions.length,
    canonical_rule_schema_hash: CANONICAL_RULE_SCHEMA_HASH,
    contradiction_count: release.contradictions.length,
    doctrine_hash: release.release_hash,
    locales: [...release.locales],
    profile_ids: profileIds,
    release_id: release.release_id,
    released_on: release.released_on,
    rule_count: release.rules.length,
    schema_version: release.schema_version,
    source_count: release.sources.length,
  };
}

export function compileDoctrine(input: unknown): CompiledDoctrine {
  const parsed = parseDoctrineAuthoringRelease(input);
  if (parsed.value === undefined) {
    throw new DoctrineCompileError("SCHEMA", parsed.diagnostics);
  }
  const diagnostics = semanticDiagnostics(parsed.value);
  if (diagnostics.length > 0) {
    throw new DoctrineCompileError("COMPILE", diagnostics);
  }

  const normalized = normalizedForCompilation(parsed.value);
  const content = releaseContent(normalized);
  const release = deepFreeze({ ...content, release_hash: canonicalHash(content) });
  const manifest = deepFreeze(buildManifest(release));
  return deepFreeze({ canonicalJson: stableStringify(release), manifest, release });
}

export function validateCompiledDoctrine(input: unknown): DoctrineValidationResult {
  const diagnostics: DoctrineDiagnostic[] = [];
  if (!isRecord(input) || !sameKeys(input, COMPILED_KEYS)) {
    return deepFreeze({
      diagnostics: freezeDiagnostics([
        {
          code: "COMPILED_SCHEMA_INVALID",
          message: "Compiled doctrine must contain exactly the compiled release fields.",
          path: "$",
        },
      ]),
      valid: false,
    });
  }

  let expected: CompiledDoctrine;
  try {
    expected = compileDoctrine(authoringFromRecord(input));
  } catch (error) {
    if (error instanceof DoctrineCompileError) {
      return deepFreeze({ diagnostics: error.diagnostics, valid: false });
    }
    throw error;
  }

  const actualContent: Record<string, unknown> = { ...input };
  Reflect.deleteProperty(actualContent, "release_hash");
  const expectedContent: Record<string, unknown> = { ...expected.release };
  Reflect.deleteProperty(expectedContent, "release_hash");
  if (stableStringify(actualContent) !== stableStringify(expectedContent)) {
    diagnostics.push({
      code: "NON_CANONICAL_RELEASE",
      message: "Compiled doctrine content or index is not canonical.",
      path: "$",
    });
  }
  if (input.release_hash !== canonicalHash(expectedContent)) {
    diagnostics.push({
      code: "RELEASE_HASH_MISMATCH",
      message: "release_hash does not match canonical compiled content.",
      path: "release_hash",
    });
  }
  return deepFreeze({
    diagnostics: freezeDiagnostics(diagnostics),
    valid: diagnostics.length === 0,
  });
}

/** Validates an untrusted compiled artifact and returns its immutable branded representation. */
export function parseCompiledDoctrine(input: unknown): CompiledDoctrineRelease {
  if (!isRecord(input)) {
    const validation = validateCompiledDoctrine(input);
    throw new DoctrineCompileError("COMPILE", validation.diagnostics);
  }
  const validation = validateCompiledDoctrine(input);
  if (!validation.valid) {
    throw new DoctrineCompileError("COMPILE", validation.diagnostics);
  }
  // Recompilation is the compiled-wire brand and immutability boundary.
  return compileDoctrine(authoringFromRecord(input)).release;
}
