import { createHash } from "node:crypto";

export function stableStringify(value: unknown): string {
  if (typeof value === "string") {
    return JSON.stringify(value.normalize("NFC"));
  }
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .map((key) => ({ key, normalizedKey: key.normalize("NFC") }))
    .sort((left, right) =>
      left.normalizedKey < right.normalizedKey
        ? -1
        : left.normalizedKey > right.normalizedKey
          ? 1
          : 0,
    )
    .map(
      ({ key, normalizedKey }) =>
        `${JSON.stringify(normalizedKey)}:${stableStringify(record[key])}`,
    );
  return `{${entries.join(",")}}`;
}

export function canonicalHash(value: unknown): string {
  return `sha256:${createHash("sha256").update(stableStringify(value)).digest("hex")}`;
}
