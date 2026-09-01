declare const factIdBrand: unique symbol;

/** A fact identifier that crossed the engine creation or bundle-validation boundary. */
export type FactId = string & { readonly [factIdBrand]: "FactId" };

const FACT_ID_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/u;

export function parseFactId(value: unknown): FactId {
  if (typeof value !== "string" || !FACT_ID_PATTERN.test(value)) {
    throw new RangeError(`INVALID_FACT_ID: ${String(value)}`);
  }
  return value as FactId;
}

export function isFactId(value: unknown): value is FactId {
  return typeof value === "string" && FACT_ID_PATTERN.test(value);
}
