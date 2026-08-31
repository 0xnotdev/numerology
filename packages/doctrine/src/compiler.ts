import {
  canonicalHash,
  PROFILE_MANIFESTS,
  type ProfileId,
  stableStringify,
} from "@numerology/engine";
import type { ZodIssue } from "zod";
import { conditionPathDefinition } from "./conditions";
import {
  type DoctrineAction,
  type DoctrineAuthoringRelease,
  type DoctrineCondition,
  type DoctrineContradiction,
  type DoctrineLocale,
  type DoctrineRule,
  type DoctrineSource,
  doctrineAuthoringReleaseSchemaV1,
} from "./schemas";

export interface DoctrineDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly path: string;
}

export interface DoctrineValidationResult {
  readonly diagnostics: readonly DoctrineDiagnostic[];
  readonly valid: boolean;
}

export interface DoctrineIndex {
  readonly byProfileMetricRoot: Readonly<
    Record<string, Readonly<Record<string, Readonly<Record<string, readonly string[]>>>>>
  >;
}

export interface CompiledDoctrineRelease {
  readonly actions: readonly DoctrineAction[];
  readonly contradictions: readonly DoctrineContradiction[];
  readonly index: DoctrineIndex;
  readonly locales: readonly DoctrineLocale[];
  readonly promotions: readonly string[];
  readonly releaseHash: string;
  readonly releaseId: string;
  readonly rules: readonly DoctrineRule[];
  readonly schemaVersion: "1.0.0";
  readonly sources: readonly DoctrineSource[];
}

export interface DoctrineReleaseManifest {
  readonly actionCount: number;
  readonly contradictionCount: number;
  readonly doctrineHash: string;
  readonly locales: readonly DoctrineLocale[];
  readonly profileIds: readonly ProfileId[];
  readonly releaseId: string;
  readonly ruleCount: number;
  readonly schemaVersion: "1.0.0";
  readonly sourceCount: number;
}

export interface CompiledDoctrine {
  readonly canonicalJson: string;
  readonly manifest: DoctrineReleaseManifest;
  readonly release: CompiledDoctrineRelease;
}

export class DoctrineCompileError extends RangeError {
  readonly diagnostics: readonly DoctrineDiagnostic[];

  constructor(kind: "COMPILE" | "SCHEMA", diagnostics: readonly DoctrineDiagnostic[]) {
    super(
      `DOCTRINE_${kind}_INVALID: ${diagnostics
        .map((diagnostic) => `${diagnostic.code}@${diagnostic.path}`)
        .join(", ")}`,
    );
    this.name = "DoctrineCompileError";
    this.diagnostics = diagnostics;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return value;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareText);
}

function conditionSignature(conditions: readonly DoctrineCondition[]): string {
  return [...conditions].map(stableStringify).sort(compareText).join("|");
}

function diagnosticSort(left: DoctrineDiagnostic, right: DoctrineDiagnostic): number {
  return (
    compareText(left.path, right.path) ||
    compareText(left.code, right.code) ||
    compareText(left.message, right.message)
  );
}

function freezeDiagnostics(diagnostics: DoctrineDiagnostic[]): readonly DoctrineDiagnostic[] {
  return Object.freeze(
    diagnostics.sort(diagnosticSort).map((diagnostic) => Object.freeze({ ...diagnostic })),
  );
}

function issuePath(issue: ZodIssue): string {
  const extraKeys =
    issue.code === "unrecognized_keys" && "keys" in issue
      ? (issue.keys as readonly PropertyKey[])
      : [];
  return [...issue.path, ...extraKeys].map(String).join(".") || "$";
}

function schemaDiagnostic(issue: ZodIssue): DoctrineDiagnostic {
  const path = issuePath(issue);
  return {
    code: path.includes("conditions") ? "INVALID_CONDITION" : "SCHEMA_INVALID",
    message: issue.message,
    path,
  };
}

function addDuplicateDiagnostics(
  diagnostics: DoctrineDiagnostic[],
  values: readonly string[],
  code: string,
  path: string,
): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      diagnostics.push({ code, message: `Duplicate identifier: ${value}.`, path });
    }
    seen.add(value);
  }
}

const profileManifestRecord = PROFILE_MANIFESTS as unknown as Readonly<
  Record<string, { readonly metrics: Readonly<Record<string, unknown>> }>
>;

function metricExists(profileId: ProfileId, metricId: string): boolean {
  const profile = profileManifestRecord[profileId];
  if (profile === undefined) {
    return false;
  }
  if (Object.hasOwn(profile.metrics, metricId)) {
    return true;
  }
  return (
    profileId === "western_decoz_v1" &&
    Object.hasOwn(profile.metrics, "personal_month") &&
    /^personal_month\.(?:0[1-9]|1[0-2])$/u.test(metricId)
  );
}

function validateCondition(
  rule: DoctrineRule,
  condition: DoctrineCondition,
  index: number,
  diagnostics: DoctrineDiagnostic[],
): void {
  const path = `rules.${rule.ruleId}.conditions.${index}`;
  const definition = conditionPathDefinition(condition.path);
  if (definition === null) {
    diagnostics.push({
      code: "UNSUPPORTED_PATH",
      message: `Condition path is not allowlisted: ${condition.path}.`,
      path,
    });
    return;
  }
  if (!definition.operators.has(condition.op)) {
    diagnostics.push({
      code: "UNSUPPORTED_PATH_OPERATOR",
      message: `${condition.op} is not supported for ${condition.path}.`,
      path,
    });
    return;
  }
  if (
    condition.op === "eq" &&
    ((definition.kind === "number" && typeof condition.value !== "number") ||
      (definition.kind === "string" && typeof condition.value !== "string"))
  ) {
    diagnostics.push({
      code: "INVALID_CONDITION_VALUE",
      message: `Condition value has the wrong type for ${condition.path}.`,
      path,
    });
  }
  if (
    condition.path === "fact.profileId" &&
    condition.op === "eq" &&
    condition.value !== rule.profileId
  ) {
    diagnostics.push({
      code: "CONDITION_IDENTITY_CONFLICT",
      message: "Profile condition crosses the rule profile boundary.",
      path,
    });
  }
  if (
    condition.path === "fact.metricId" &&
    condition.op === "eq" &&
    condition.value !== rule.metricId
  ) {
    diagnostics.push({
      code: "CONDITION_IDENTITY_CONFLICT",
      message: "Metric condition crosses the rule metric boundary.",
      path,
    });
  }
}

function exclusionCycles(rules: readonly DoctrineRule[]): readonly string[] {
  const graph = new Map(rules.map((rule) => [rule.ruleId, rule.exclusions]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cycles = new Set<string>();

  function visit(ruleId: string, trail: readonly string[]): void {
    if (visiting.has(ruleId)) {
      const cycleStart = trail.indexOf(ruleId);
      cycles.add([...trail.slice(cycleStart), ruleId].join(" -> "));
      return;
    }
    if (visited.has(ruleId)) {
      return;
    }
    visiting.add(ruleId);
    for (const target of graph.get(ruleId) ?? []) {
      if (graph.has(target)) {
        visit(target, [...trail, ruleId]);
      }
    }
    visiting.delete(ruleId);
    visited.add(ruleId);
  }

  for (const ruleId of [...graph.keys()].sort(compareText)) {
    visit(ruleId, []);
  }
  return [...cycles].sort(compareText);
}

function semanticDiagnostics(input: DoctrineAuthoringRelease): readonly DoctrineDiagnostic[] {
  const diagnostics: DoctrineDiagnostic[] = [];
  addDuplicateDiagnostics(
    diagnostics,
    input.rules.map((rule) => rule.ruleId),
    "DUPLICATE_RULE_ID",
    "rules",
  );
  addDuplicateDiagnostics(
    diagnostics,
    input.sources.map((source) => source.sourceId),
    "DUPLICATE_SOURCE_ID",
    "sources",
  );
  addDuplicateDiagnostics(
    diagnostics,
    input.actions.map((action) => action.actionKey),
    "DUPLICATE_ACTION_KEY",
    "actions",
  );
  addDuplicateDiagnostics(
    diagnostics,
    input.contradictions.map((item) => item.contradictionId),
    "DUPLICATE_CONTRADICTION_ID",
    "contradictions",
  );
  addDuplicateDiagnostics(diagnostics, input.locales, "DUPLICATE_LOCALE", "locales");
  addDuplicateDiagnostics(diagnostics, input.promotions, "DUPLICATE_PROMOTION", "promotions");

  if (!input.locales.includes("en")) {
    diagnostics.push({
      code: "MISSING_BASE_LOCALE",
      message: "Every doctrine release must include English source atoms.",
      path: "locales",
    });
  }

  const ruleIds = new Set(input.rules.map((rule) => rule.ruleId));
  const sources = new Map(input.sources.map((source) => [source.sourceId, source]));
  const actions = new Map(input.actions.map((action) => [action.actionKey, action]));

  for (const promotion of input.promotions) {
    if (!ruleIds.has(promotion)) {
      diagnostics.push({
        code: "UNKNOWN_PROMOTION",
        message: `Promotion references unknown rule ${promotion}.`,
        path: "promotions",
      });
    }
  }

  for (const action of input.actions) {
    for (const locale of input.locales) {
      if ((action.instructions[locale] ?? []).length === 0) {
        diagnostics.push({
          code: "MISSING_ACTION_LOCALE",
          message: `Action ${action.actionKey} has no ${locale} instruction.`,
          path: `actions.${action.actionKey}.instructions.${locale}`,
        });
      }
    }
  }

  const triggerOwners = new Map<string, string>();
  const claims = new Map<
    string,
    { readonly ruleId: string; readonly valence: DoctrineRule["valence"] }
  >();
  for (const rule of input.rules) {
    if (!metricExists(rule.profileId, rule.metricId)) {
      diagnostics.push({
        code: "UNKNOWN_METRIC",
        message: `Metric ${rule.metricId} is not in profile ${rule.profileId}.`,
        path: `rules.${rule.ruleId}.metricId`,
      });
    }
    addDuplicateDiagnostics(
      diagnostics,
      rule.actionKeys,
      "DUPLICATE_ACTION_REFERENCE",
      `rules.${rule.ruleId}.actionKeys`,
    );
    addDuplicateDiagnostics(
      diagnostics,
      rule.exclusions,
      "DUPLICATE_EXCLUSION",
      `rules.${rule.ruleId}.exclusions`,
    );
    addDuplicateDiagnostics(
      diagnostics,
      rule.sourceRefs.map((source) => `${source.sourceId}\u0000${source.locator}`),
      "DUPLICATE_SOURCE_REFERENCE",
      `rules.${rule.ruleId}.sourceRefs`,
    );

    rule.conditions.forEach((condition, index) => {
      validateCondition(rule, condition, index, diagnostics);
    });
    const conditionKeys = rule.conditions.map(stableStringify);
    addDuplicateDiagnostics(
      diagnostics,
      conditionKeys,
      "DUPLICATE_CONDITION",
      `rules.${rule.ruleId}.conditions`,
    );

    const equalityByPath = new Map<string, string>();
    for (const condition of rule.conditions) {
      if (condition.op !== "eq") {
        continue;
      }
      const value = stableStringify(condition.value);
      const prior = equalityByPath.get(condition.path);
      if (prior !== undefined && prior !== value) {
        diagnostics.push({
          code: "UNSATISFIABLE_CONDITIONS",
          message: `Conflicting equality conditions for ${condition.path}.`,
          path: `rules.${rule.ruleId}.conditions`,
        });
      }
      equalityByPath.set(condition.path, value);
    }

    const trigger = `${rule.profileId}\u0000${rule.metricId}\u0000${conditionSignature(rule.conditions)}`;
    const owner = triggerOwners.get(trigger);
    if (owner !== undefined) {
      diagnostics.push({
        code: "DUPLICATE_CONDITIONS",
        message: `Rules ${owner} and ${rule.ruleId} have the same trigger.`,
        path: `rules.${rule.ruleId}.conditions`,
      });
    } else {
      triggerOwners.set(trigger, rule.ruleId);
    }

    for (const reference of rule.sourceRefs) {
      if (!sources.has(reference.sourceId)) {
        diagnostics.push({
          code: "UNKNOWN_SOURCE",
          message: `Rule references unknown source ${reference.sourceId}.`,
          path: `rules.${rule.ruleId}.sourceRefs`,
        });
      }
    }
    for (const actionKey of rule.actionKeys) {
      if (!actions.has(actionKey)) {
        diagnostics.push({
          code: "UNKNOWN_ACTION",
          message: `Rule references unknown action ${actionKey}.`,
          path: `rules.${rule.ruleId}.actionKeys`,
        });
      }
    }
    for (const excludedRuleId of rule.exclusions) {
      if (!ruleIds.has(excludedRuleId)) {
        diagnostics.push({
          code: "UNKNOWN_EXCLUSION",
          message: `Rule excludes unknown rule ${excludedRuleId}.`,
          path: `rules.${rule.ruleId}.exclusions`,
        });
      }
    }

    if (rule.status === "active" || rule.status === "experimental") {
      for (const locale of input.locales) {
        if (rule.claims[locale].length === 0) {
          diagnostics.push({
            code: "MISSING_LOCALE_CLAIMS",
            message: `Rule ${rule.ruleId} has no ${locale} claim atoms.`,
            path: `rules.${rule.ruleId}.claims.${locale}`,
          });
        }
      }
    }

    if (rule.status === "active") {
      for (const claim of Object.values(rule.claims).flat()) {
        const claimKey = claim.normalize("NFC").trim().toLocaleLowerCase("en-US");
        const prior = claims.get(claimKey);
        if (
          prior !== undefined &&
          ((prior.valence === "strength" && rule.valence === "tension") ||
            (prior.valence === "tension" && rule.valence === "strength"))
        ) {
          diagnostics.push({
            code: "CONFLICTING_ACTIVE_CLAIM",
            message: `Rules ${prior.ruleId} and ${rule.ruleId} assign opposing valence to one atom.`,
            path: `rules.${rule.ruleId}.claims`,
          });
        } else if (prior === undefined) {
          claims.set(claimKey, { ruleId: rule.ruleId, valence: rule.valence });
        }
      }
    }
  }

  for (const cycle of exclusionCycles(input.rules)) {
    diagnostics.push({
      code: "EXCLUSION_CYCLE",
      message: `Rule exclusion cycle: ${cycle}.`,
      path: "rules.exclusions",
    });
  }

  return freezeDiagnostics(diagnostics);
}

function parseAuthoring(
  input: unknown,
):
  | { readonly diagnostics: readonly DoctrineDiagnostic[]; readonly value?: never }
  | { readonly diagnostics: readonly []; readonly value: DoctrineAuthoringRelease } {
  const parsed = doctrineAuthoringReleaseSchemaV1.safeParse(input);
  if (!parsed.success) {
    return {
      diagnostics: freezeDiagnostics(parsed.error.issues.map(schemaDiagnostic)),
    };
  }
  return { diagnostics: [], value: parsed.data };
}

export function validateDoctrine(input: unknown): DoctrineValidationResult {
  const parsed = parseAuthoring(input);
  if (parsed.value === undefined) {
    return { diagnostics: parsed.diagnostics, valid: false };
  }
  const diagnostics = semanticDiagnostics(parsed.value);
  return { diagnostics, valid: diagnostics.length === 0 };
}

function normalizeRule(rule: DoctrineRule): DoctrineRule {
  return {
    ...rule,
    actionKeys: sortedUnique(rule.actionKeys),
    claims: {
      en: sortedUnique(rule.claims.en),
      hi: sortedUnique(rule.claims.hi),
      or: sortedUnique(rule.claims.or),
    },
    conditions: [...rule.conditions].sort((left, right) =>
      compareText(stableStringify(left), stableStringify(right)),
    ),
    exclusions: sortedUnique(rule.exclusions),
    safetyTags: sortedUnique(rule.safetyTags),
    sourceRefs: [...rule.sourceRefs].sort((left, right) =>
      compareText(stableStringify(left), stableStringify(right)),
    ),
    themes: sortedUnique(rule.themes),
  };
}

function normalizeAuthoring(input: DoctrineAuthoringRelease): DoctrineAuthoringRelease {
  return {
    actions: [...input.actions]
      .map((action) => ({
        ...action,
        instructions: {
          en: sortedUnique(action.instructions.en),
          ...(action.instructions.hi === undefined
            ? {}
            : { hi: sortedUnique(action.instructions.hi) }),
          ...(action.instructions.or === undefined
            ? {}
            : { or: sortedUnique(action.instructions.or) }),
        },
        safetyTags: sortedUnique(action.safetyTags),
      }))
      .sort((left, right) => compareText(left.actionKey, right.actionKey)),
    contradictions: [...input.contradictions].sort((left, right) =>
      compareText(left.contradictionId, right.contradictionId),
    ),
    locales: sortedUnique(input.locales) as DoctrineLocale[],
    promotions: sortedUnique(input.promotions),
    releaseId: input.releaseId,
    rules: [...input.rules]
      .map(normalizeRule)
      .sort((left, right) => compareText(left.ruleId, right.ruleId)),
    schemaVersion: input.schemaVersion,
    sources: [...input.sources].sort((left, right) => compareText(left.sourceId, right.sourceId)),
  };
}

export function buildDoctrineIndex(rules: readonly DoctrineRule[]): DoctrineIndex {
  const mutable: Record<string, Record<string, Record<string, string[]>>> = {};
  for (const rule of [...rules].sort((left, right) => compareText(left.ruleId, right.ruleId))) {
    const rootCondition = rule.conditions.find(
      (condition) => condition.op === "eq" && condition.path === "fact.root",
    );
    const root =
      rootCondition?.op === "eq" && typeof rootCondition.value === "number"
        ? String(rootCondition.value)
        : "*";
    let profile = mutable[rule.profileId];
    if (profile === undefined) {
      profile = {};
      mutable[rule.profileId] = profile;
    }
    let metric = profile[rule.metricId];
    if (metric === undefined) {
      metric = {};
      profile[rule.metricId] = metric;
    }
    let ruleIds = metric[root];
    if (ruleIds === undefined) {
      ruleIds = [];
      metric[root] = ruleIds;
    }
    ruleIds.push(rule.ruleId);
  }
  for (const profile of Object.values(mutable)) {
    for (const metric of Object.values(profile)) {
      for (const [root, ruleIds] of Object.entries(metric)) {
        metric[root] = sortedUnique(ruleIds);
      }
    }
  }
  return deepFreeze({ byProfileMetricRoot: mutable });
}

export function indexRuleIds(
  index: DoctrineIndex,
  profileId: string,
  metricId: string,
  root: number,
): readonly string[] {
  const roots = index.byProfileMetricRoot[profileId]?.[metricId];
  if (roots === undefined) {
    return Object.freeze([]);
  }
  return Object.freeze(sortedUnique([...(roots[String(root)] ?? []), ...(roots["*"] ?? [])]));
}

function releaseContent(input: DoctrineAuthoringRelease, index: DoctrineIndex) {
  return {
    actions: input.actions,
    contradictions: input.contradictions,
    index,
    locales: input.locales,
    promotions: input.promotions,
    releaseId: input.releaseId,
    rules: input.rules,
    schemaVersion: input.schemaVersion,
    sources: input.sources,
  };
}

export function compileDoctrine(input: unknown): CompiledDoctrine {
  const parsed = parseAuthoring(input);
  if (parsed.value === undefined) {
    throw new DoctrineCompileError("SCHEMA", parsed.diagnostics);
  }
  const diagnostics = semanticDiagnostics(parsed.value);
  if (diagnostics.length > 0) {
    throw new DoctrineCompileError("COMPILE", diagnostics);
  }

  const normalized = normalizeAuthoring(parsed.value);
  const index = buildDoctrineIndex(normalized.rules);
  const content = releaseContent(normalized, index);
  const releaseHash = canonicalHash(content);
  const release = deepFreeze({ ...content, releaseHash });
  const profileIds = sortedUnique(normalized.rules.map((rule) => rule.profileId)) as ProfileId[];
  const manifest = deepFreeze({
    actionCount: normalized.actions.length,
    contradictionCount: normalized.contradictions.length,
    doctrineHash: releaseHash,
    locales: [...normalized.locales],
    profileIds,
    releaseId: normalized.releaseId,
    ruleCount: normalized.rules.length,
    schemaVersion: normalized.schemaVersion,
    sourceCount: normalized.sources.length,
  });
  return deepFreeze({ canonicalJson: stableStringify(release), manifest, release });
}

const COMPILED_KEYS = Object.freeze([
  "actions",
  "contradictions",
  "index",
  "locales",
  "promotions",
  "releaseHash",
  "releaseId",
  "rules",
  "schemaVersion",
  "sources",
]);

export function validateCompiledDoctrine(input: unknown): DoctrineValidationResult {
  if (!isRecord(input)) {
    return {
      diagnostics: freezeDiagnostics([
        {
          code: "COMPILED_SCHEMA_INVALID",
          message: "Compiled doctrine must be an object.",
          path: "$",
        },
      ]),
      valid: false,
    };
  }
  if (
    Object.keys(input).sort(compareText).join("\u0000") !==
    [...COMPILED_KEYS].sort(compareText).join("\u0000")
  ) {
    return {
      diagnostics: freezeDiagnostics([
        {
          code: "COMPILED_SCHEMA_INVALID",
          message: "Compiled doctrine has missing or unknown fields.",
          path: "$",
        },
      ]),
      valid: false,
    };
  }

  const authoring = {
    actions: input.actions,
    contradictions: input.contradictions,
    locales: input.locales,
    promotions: input.promotions,
    releaseId: input.releaseId,
    rules: input.rules,
    schemaVersion: input.schemaVersion,
    sources: input.sources,
  };
  const parsed = parseAuthoring(authoring);
  if (parsed.value === undefined) {
    return { diagnostics: parsed.diagnostics, valid: false };
  }
  const semantic = semanticDiagnostics(parsed.value);
  if (semantic.length > 0) {
    return { diagnostics: semantic, valid: false };
  }

  const normalized = normalizeAuthoring(parsed.value);
  const expectedIndex = buildDoctrineIndex(normalized.rules);
  const expectedContent = releaseContent(normalized, expectedIndex);
  const diagnostics: DoctrineDiagnostic[] = [];
  const actualContent = { ...input };
  delete actualContent.releaseHash;
  if (stableStringify(actualContent) !== stableStringify(expectedContent)) {
    diagnostics.push({
      code: "NON_CANONICAL_RELEASE",
      message: "Compiled doctrine content or index is not canonical.",
      path: "$",
    });
  }
  if (input.releaseHash !== canonicalHash(expectedContent)) {
    diagnostics.push({
      code: "RELEASE_HASH_MISMATCH",
      message: "Compiled doctrine hash does not match its canonical content.",
      path: "releaseHash",
    });
  }
  return { diagnostics: freezeDiagnostics(diagnostics), valid: diagnostics.length === 0 };
}
