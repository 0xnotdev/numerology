import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_VERSION = "v1";
const COOKIE_PATTERN = /^v1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/u;

export interface DraftCookiePayload {
  readonly expiresAt: string;
  readonly intentId: string;
}

function signature(body: string, secret: string): string {
  return createHmac("sha256", secret).update(`${COOKIE_VERSION}.${body}`).digest("base64url");
}

function validPayload(input: unknown): input is DraftCookiePayload {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return false;
  const candidate = input as Record<string, unknown>;
  if (Object.keys(candidate).length !== 2) return false;
  if (typeof candidate.intentId !== "string" || !/^[0-9a-f-]{36}$/u.test(candidate.intentId))
    return false;
  if (typeof candidate.expiresAt !== "string") return false;
  const expiresAt = new Date(candidate.expiresAt);
  return !Number.isNaN(expiresAt.valueOf()) && expiresAt.toISOString() === candidate.expiresAt;
}

export function createDraftCookie(payload: DraftCookiePayload, secret: string, now: Date): string {
  if (
    secret.length < 16 ||
    !Number.isFinite(now.valueOf()) ||
    !validPayload(payload) ||
    new Date(payload.expiresAt).valueOf() <= now.valueOf()
  ) {
    throw new RangeError("DRAFT_COOKIE_INPUT_INVALID");
  }
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${COOKIE_VERSION}.${body}.${signature(body, secret)}`;
}

/** Returns null for any malformed, forged, expired, or structurally unknown cookie. */
export function verifyDraftCookie(
  cookie: string,
  secret: string,
  now: Date,
): DraftCookiePayload | null {
  if (secret.length < 16 || !Number.isFinite(now.valueOf())) return null;
  const match = COOKIE_PATTERN.exec(cookie);
  if (match === null) return null;
  const body = match[1] as string;
  const provided = Buffer.from(match[2] as string, "base64url");
  const expected = Buffer.from(signature(body, secret), "base64url");
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as unknown;
    if (!validPayload(payload) || new Date(payload.expiresAt).valueOf() <= now.valueOf())
      return null;
    return Object.freeze({ ...payload });
  } catch {
    return null;
  }
}
