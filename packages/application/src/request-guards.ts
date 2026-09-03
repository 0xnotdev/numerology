import { timingSafeEqual } from "node:crypto";

/** Constant-time equality for synchronizer/double-submit CSRF tokens. */
export function verifyCsrfToken(expected: string, provided: string): boolean {
  if (
    typeof expected !== "string" ||
    typeof provided !== "string" ||
    expected.length === 0 ||
    provided.length === 0 ||
    expected.length > 4_096 ||
    provided.length > 4_096
  ) {
    return false;
  }
  const expectedBytes = Buffer.from(expected, "utf8");
  const providedBytes = Buffer.from(provided, "utf8");
  return (
    expectedBytes.length === providedBytes.length && timingSafeEqual(expectedBytes, providedBytes)
  );
}
