declare const ruleIdBrand: unique symbol;
declare const sourceIdBrand: unique symbol;
declare const actionIdBrand: unique symbol;

export type RuleId = string & { readonly [ruleIdBrand]: "RuleId" };
export type SourceId = string & { readonly [sourceIdBrand]: "SourceId" };
export type ActionId = string & { readonly [actionIdBrand]: "ActionId" };

const RULE_ID_PATTERN = /^[A-Z0-9_-]+$/u;
const SOURCE_ID_PATTERN = /^[A-Z0-9][A-Z0-9_-]*$/u;
const ACTION_ID_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/u;

function parseIdentifier<T extends string>(value: unknown, pattern: RegExp, code: string): T {
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new RangeError(`${code}: ${String(value)}`);
  }
  return value as T;
}

export function parseRuleId(value: unknown): RuleId {
  return parseIdentifier<RuleId>(value, RULE_ID_PATTERN, "INVALID_RULE_ID");
}

export function parseSourceId(value: unknown): SourceId {
  return parseIdentifier<SourceId>(value, SOURCE_ID_PATTERN, "INVALID_SOURCE_ID");
}

export function parseActionId(value: unknown): ActionId {
  return parseIdentifier<ActionId>(value, ACTION_ID_PATTERN, "INVALID_ACTION_ID");
}

export function isRuleId(value: unknown): value is RuleId {
  return typeof value === "string" && RULE_ID_PATTERN.test(value);
}

export function isSourceId(value: unknown): value is SourceId {
  return typeof value === "string" && SOURCE_ID_PATTERN.test(value);
}

export function isActionId(value: unknown): value is ActionId {
  return typeof value === "string" && ACTION_ID_PATTERN.test(value);
}
