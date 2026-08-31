import type { CalculatedFact } from "@numerology/engine";
import type { DoctrineCondition } from "./schemas";

export type ConditionValueKind = "number" | "string" | "string_collection";

interface ConditionPathDefinition {
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
  if (/^fact\.occurrences\.[1-9]$/u.test(path)) {
    return { kind: "number", operators: EQ_GTE };
  }
  return null;
}

function metadataValue(fact: CalculatedFact, key: string): unknown {
  const metadata = fact.metadata;
  if (metadata === undefined || !Object.hasOwn(metadata, key)) {
    return undefined;
  }
  return metadata[key];
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
      const occurrence = /^fact\.occurrences\.([1-9])$/u.exec(path);
      if (occurrence !== null) {
        const digit = occurrence[1];
        return digit === undefined ? undefined : fact.occurrences?.[digit];
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
      return (
        Array.isArray(actual) &&
        actual.every((item) => typeof item === "string") &&
        actual.includes(condition.value)
      );
    case "gte":
      return typeof actual === "number" && Number.isFinite(actual) && actual >= condition.value;
  }
}

export function evaluateConditions(
  conditions: readonly DoctrineCondition[],
  fact: CalculatedFact,
): boolean {
  return conditions.every((condition) => evaluateCondition(condition, fact));
}
