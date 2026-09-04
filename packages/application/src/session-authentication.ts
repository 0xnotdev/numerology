import { createHash, timingSafeEqual } from "node:crypto";
import type { Clock } from "./clock";

export interface SessionRepository {
  /** Returns only an active session and its authentication timestamp. */
  findActive(
    tokenDigest: Uint8Array,
    now: Date,
  ): Promise<{
    readonly principalId: string;
    readonly csrfDigest: Uint8Array;
    /** The time at which the passwordless challenge issued this session. */
    readonly authenticatedAt?: Date;
    readonly sessionId?: string;
  } | null>;
}

export interface AuthenticatedSession {
  readonly principalId: string;
  readonly csrfDigest: Uint8Array;
  readonly authenticatedAt?: Date;
  readonly sessionId?: string;
}

export interface SessionRequestContext {
  readonly session: AuthenticatedSession | null;
  /** Origin and synchronizer token are both required; this is false for all unsafe requests otherwise. */
  readonly csrfValid: boolean;
  /** Old or timestamp-less sessions deliberately fail closed for sensitive operations. */
  readonly recentAuth: boolean;
}

export interface SessionAuthentication {
  read(request: Request): Promise<SessionRequestContext>;
  isRecent(session: AuthenticatedSession, now?: Date): boolean;
}

export const PRIVATE_SESSION_COOKIE = "__Host-numerology_session" as const;
export const PRIVATE_CSRF_COOKIE = "__Host-numerology_csrf" as const;
export const PRIVATE_CSRF_HEADER = "x-csrf-token" as const;
export const DEFAULT_RECENT_AUTH_WINDOW_MS = 15 * 60 * 1_000;

const TOKEN = /^[A-Za-z0-9_-]{43}$/u;

function readCookie(request: Request, name: string): string | null {
  const matches = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${name}=`));
  if (matches.length !== 1) return null;
  const value = matches[0]?.slice(name.length + 1) ?? "";
  return TOKEN.test(value) && Buffer.from(value, "base64url").toString("base64url") === value
    ? value
    : null;
}

function digest(purpose: "session" | "csrf", token: string): Buffer {
  return createHash("sha256").update(`numerology:${purpose}:v1:${token}`).digest();
}

/**
 * Request-local authentication policy for private HTTP routes. It derives identity only from the
 * active server-side session and keeps CSRF/recent-auth decisions beside session verification.
 */
export function createSessionAuthentication(dependencies: {
  readonly clock: Clock;
  readonly origin: string;
  readonly sessions: SessionRepository;
  readonly recentAuthWindowMs?: number;
}): SessionAuthentication {
  const origin = new URL(dependencies.origin);
  if (origin.protocol !== "https:" || origin.origin !== dependencies.origin) {
    throw new RangeError("AUTH_ORIGIN_INVALID");
  }
  const recentAuthWindowMs = dependencies.recentAuthWindowMs ?? DEFAULT_RECENT_AUTH_WINDOW_MS;
  if (!Number.isSafeInteger(recentAuthWindowMs) || recentAuthWindowMs <= 0) {
    throw new RangeError("RECENT_AUTH_WINDOW_INVALID");
  }

  function isRecent(session: AuthenticatedSession, now = dependencies.clock.now()): boolean {
    const authenticatedAt = session.authenticatedAt;
    return (
      authenticatedAt !== undefined &&
      Number.isFinite(now.valueOf()) &&
      Number.isFinite(authenticatedAt.valueOf()) &&
      authenticatedAt.valueOf() <= now.valueOf() &&
      now.valueOf() - authenticatedAt.valueOf() <= recentAuthWindowMs
    );
  }

  return {
    isRecent,
    async read(request) {
      const now = dependencies.clock.now();
      if (!Number.isFinite(now.valueOf()))
        return { csrfValid: false, recentAuth: false, session: null };
      const token = readCookie(request, PRIVATE_SESSION_COOKIE);
      const session =
        token === null
          ? null
          : await dependencies.sessions.findActive(digest("session", token), now);
      const csrf = request.headers.get(PRIVATE_CSRF_HEADER) ?? "";
      const expected = session?.csrfDigest;
      const actual = TOKEN.test(csrf) ? digest("csrf", csrf) : null;
      const csrfValid =
        session !== null &&
        request.headers.get("origin") === origin.origin &&
        actual !== null &&
        expected !== undefined &&
        expected.byteLength === actual.byteLength &&
        timingSafeEqual(expected, actual);
      return {
        csrfValid,
        recentAuth: session === null ? false : isRecent(session, now),
        session,
      };
    },
  };
}
