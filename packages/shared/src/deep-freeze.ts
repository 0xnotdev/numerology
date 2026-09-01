/**
 * Recursively freezes an object graph in place while preserving its inferred type.
 * Cycles and shared references are safe because every object is frozen before traversal.
 */
export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }

  Object.freeze(value);
  for (const child of Reflect.ownKeys(value).map(
    (key) => (value as Record<PropertyKey, unknown>)[key],
  )) {
    deepFreeze(child);
  }
  return value;
}
