import type { CalculatedFact } from "@numerology/engine";
import type { DoctrineDiagnostic } from "./diagnostics";
import { freezeDiagnostics } from "./diagnostics";

export type DoctrineCondition =
  | { readonly op: "eq"; readonly path: string; readonly value: number | string }
  | { readonly op: "contains"; readonly path: string; readonly value: string }
  | { readonly op: "gte"; readonly path: string; readonly value: number };

export type ConditionValueKind = "number" | "string" | "string_collection";

export interface ConditionPathDefinition {
  readonly kind: ConditionValueKind;
  readonly operators: ReadonlySet<DoctrineCondition["op"]>;
}

const EQ = new Set<DoctrineCondition["op"]>(["eq"]);
const EQ_GTE = new Set<DoctrineCondition["op"]>(["eq", "gte"]);
const CONTAINS = new Set<DoctrineCondition["op"]>(["contains"]);

const EXACT_PATHS: Readonly<Record<string, ConditionPathDefinition>> = Object.freeze({
  "fact.compound": { kind: "number", operators: EQ_GTE },
  "fact.displayTokens": { kind: "string_collection", operators: CONTAINS },
  "fact.factId": { kind: "string", operators: EQ },
  "fact.master": { kind: "number", operators: EQ_GTE },
  "fact.metadata.month": { kind: "number", operators: EQ_GTE },
  "fact.metadata.personalYearRoot": { kind: "number", operators: EQ_GTE },
  "fact.metadata.planet": { kind: "string", operators: EQ },
  "fact.metadata.targetYear": { kind: "number", operators: EQ_GTE },
  "fact.metadata.weekday": { kind: "string", operators: EQ },
  "fact.metadata.weekdayValue": { kind: "number", operators: EQ_GTE },
  "fact.metadata.yearSuffix": { kind: "number", operators: EQ_GTE },
  "fact.metricId": { kind: "string", operators: EQ },
  "fact.profileId": { kind: "string", operators: EQ },
  "fact.root": { kind: "number", operators: EQ_GTE },
});

export function conditionPathDefinition(path: string): ConditionPathDefinition | null {
  const exact = EXACT_PATHS[path];
  if (exact !== undefined) {
    return exact;
  }
  return /^fact\.occurrences\.[1-9]$/u.test(path) ? { kind: "number", operators: EQ_GTE } : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export type TriggerParseResult =
  | { readonly conditions?: never; readonly diagnostics: readonly DoctrineDiagnostic[] }
  | { readonly conditions: readonly DoctrineCondition[]; readonly diagnostics: readonly [] };

export function parseTrigger(trigger: unknown, path = "trigger"): TriggerParseResult {
  if (!isRecord(trigger) || Object.keys(trigger).length !== 1 || !Array.isArray(trigger.all)) {
    return {
      diagnostics: freezeDiagnostics([
        {
          code: "INVALID_TRIGGER",
          message: "trigger must be an object containing only a non-empty all array.",
          path,
        },
      ]),
    };
  }
  if (trigger.all.length === 0) {
    return {
      diagnostics: freezeDiagnostics([
        { code: "INVALID_TRIGGER", message: "trigger.all cannot be empty.", path: `${path}.all` },
      ]),
    };
  }

  const conditions: DoctrineCondition[] = [];
  const diagnostics: DoctrineDiagnostic[] = [];
  trigger.all.forEach((item, index) => {
    const itemPath = `${path}.all.${index}`;
    if (!isRecord(item) || Object.keys(item).sort().join(",") !== "op,path,value") {
      diagnostics.push({
        code: "INVALID_CONDITION",
        message: "A condition must contain exactly op, path, and value.",
        path: itemPath,
      });
      return;
    }
    if (typeof item.path !== "string" || typeof item.op !== "string") {
      diagnostics.push({
        code: "INVALID_CONDITION",
        message: "Condition path and op must be strings.",
        path: itemPath,
      });
      return;
    }
    const definition = conditionPathDefinition(item.path);
    if (definition === null) {
      diagnostics.push({
        code: "UNSUPPORTED_PATH",
        message: `Condition path is not allowlisted: ${item.path}.`,
        path: itemPath,
      });
      return;
    }
    if (item.op !== "eq" && item.op !== "contains" && item.op !== "gte") {
      diagnostics.push({
        code: "INVALID_CONDITION",
        message: `Unsupported condition operator: ${item.op}.`,
        path: itemPath,
      });
      return;
    }
    if (!definition.operators.has(item.op)) {
      diagnostics.push({
        code: "UNSUPPORTED_PATH_OPERATOR",
        message: `${item.op} is not supported for ${item.path}.`,
        path: itemPath,
      });
      return;
    }
    const expected = definition.kind === "string_collection" ? "string" : definition.kind;
    if (
      typeof item.value !== expected ||
      (typeof item.value === "number" && !Number.isFinite(item.value))
    ) {
      diagnostics.push({
        code: "INVALID_CONDITION_VALUE",
        message: `Condition value for ${item.path} must be a finite ${expected}.`,
        path: itemPath,
      });
      return;
    }
    conditions.push(item as DoctrineCondition);
  });

  return diagnostics.length > 0
    ? { diagnostics: freezeDiagnostics(diagnostics) }
    : { conditions, diagnostics: [] };
}

function metadataValue(fact: CalculatedFact, key: string): unknown {
  return fact.metadata !== undefined && Object.hasOwn(fact.metadata, key)
    ? fact.metadata[key]
    : undefined;
}

function conditionPathValue(path: string, fact: CalculatedFact): unknown {
  switch (path) {
    case "fact.compound":
      return fact.compound;
    case "fact.displayTokens":
      return fact.displayTokens;
    case "fact.factId":
      return fact.factId;
    case "fact.master":
      return fact.master;
    case "fact.metricId":
      return fact.metricId;
    case "fact.profileId":
      return fact.profileId;
    case "fact.root":
      return fact.root;
    case "fact.metadata.month":
      return metadataValue(fact, "month");
    case "fact.metadata.personalYearRoot":
      return metadataValue(fact, "personalYearRoot");
    case "fact.metadata.planet":
      return metadataValue(fact, "planet");
    case "fact.metadata.targetYear":
      return metadataValue(fact, "targetYear");
    case "fact.metadata.weekday":
      return metadataValue(fact, "weekday");
    case "fact.metadata.weekdayValue":
      return metadataValue(fact, "weekdayValue");
    case "fact.metadata.yearSuffix":
      return metadataValue(fact, "yearSuffix");
    default: {
      const digit = /^fact\.occurrences\.([1-9])$/u.exec(path)?.[1];
      if (digit !== undefined) {
        return fact.occurrences?.[digit];
      }
      throw new RangeError(`UNSUPPORTED_CONDITION_PATH: ${path}`);
    }
  }
}

export function evaluateCondition(condition: DoctrineCondition, fact: CalculatedFact): boolean {
  const definition = conditionPathDefinition(condition.path);
  if (definition === null || !definition.operators.has(condition.op)) {
    throw new RangeError(`UNSUPPORTED_CONDITION_PATH: ${condition.path}/${condition.op}`);
  }
  const actual = conditionPathValue(condition.path, fact);
  switch (condition.op) {
    case "eq":
      return actual === condition.value;
    case "contains":
      return Array.isArray(actual) && actual.includes(condition.value);
    case "gte":
      return typeof actual === "number" && Number.isFinite(actual) && actual >= condition.value;
  }
}

export function evaluateTrigger(trigger: unknown, fact: CalculatedFact): boolean {
  const parsed = parseTrigger(trigger);
  if (parsed.conditions === undefined) {
    throw new RangeError("INVALID_COMPILED_TRIGGER");
  }
  return parsed.conditions.every((condition) => evaluateCondition(condition, fact));
}
