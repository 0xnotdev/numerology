import { canonicalHash } from "@numerology/engine";
import type { CanonicalDoctrineRule } from "./canonical-rule";
import { normalizeRule } from "./normalization";

export function calculateRuleContentHash(rule: CanonicalDoctrineRule): string {
  const content: Record<string, unknown> = { ...normalizeRule(rule) };
  Reflect.deleteProperty(content, "content_hash");
  return canonicalHash(content);
}

export function withComputedRuleContentHash(
  rule: CanonicalDoctrineRule,
): CanonicalDoctrineRule & { readonly content_hash: string } {
  const normalized = normalizeRule(rule);
  return { ...normalized, content_hash: calculateRuleContentHash(normalized) };
}

export function isCanonicalHash(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/u.test(value);
}
