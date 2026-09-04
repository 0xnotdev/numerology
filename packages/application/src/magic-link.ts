import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import type { Clock } from "./clock";
import { type FieldProtector, serializeProtectedField } from "./field-protection";
import type { SupportedLocale } from "./report-intent-repository";

export interface MagicLinkRepository {
  /** Scheduled maintenance: erase expired pending email and delete sign-in challenge history after 24h. */
  purgeExpired(now: Date, limit: number): Promise<number>;
  /** Atomically replace an old challenge subject to the durable per-email send budget. */
  issue(input: {
    id: string;
    emailLookupHmac: Uint8Array;
    emailCiphertext: Uint8Array;
    emailKeyVersion: number;
    locale: SupportedLocale;
    tokenDigest: Uint8Array;
    browserDigest: Uint8Array;
    now: Date;
    expiresAt: Date;
  }): Promise<boolean>;
  revokeChallenge(id: string, now: Date): Promise<void>;
  /** Single transaction: verify/consume challenge, create or find principal, issue fresh session. */
  consume(input: {
    tokenDigest: Uint8Array;
    browserDigest: Uint8Array;
    now: Date;
    principalId: string;
    sessionId: string;
    sessionDigest: Uint8Array;
    csrfDigest: Uint8Array;
    expiresAt: Date;
  }): Promise<boolean>;
}

export interface MagicLinkSender {
  /** Must honor cancellation. Do not log the recipient, URL, or token. */
  send(
    message: { email: string; url: string; expiresAt: Date },
    signal: AbortSignal,
  ): Promise<void>;
}

export interface MagicLinkHttpHandlers {
  requestLink(request: Request): Promise<Response>;
  consumeLink(request: Request): Promise<Response>;
}

const TOKEN = /^[A-Za-z0-9_-]{43}$/u;
const LOGIN_COOKIE = "__Host-numerology_login";
const LINK_MS = 10 * 60 * 1000;
const SESSION_MS = 24 * 60 * 60 * 1000;
const inputSchema = z.strictObject({
  email: z
    .string()
    .trim()
    .max(254)
    .email()
    .transform((email) => email.toLowerCase()),
  locale: z.enum(["en-IN", "hi-IN", "or-IN"]),
});
const consumeSchema = z.strictObject({ token: z.string().regex(TOKEN) });
const digest = (purpose: string, token: string) =>
  createHash("sha256").update(`numerology:${purpose}:v1:${token}`).digest();

function browserToken(request: Request): string | null {
  const cookies = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${LOGIN_COOKIE}=`));
  if (cookies.length !== 1) return null;
  const token = cookies[0]?.slice(LOGIN_COOKIE.length + 1) ?? "";
  return TOKEN.test(token) && Buffer.from(token, "base64url").toString("base64url") === token
    ? token
    : null;
}

function response(status: number, body: unknown, cookies: string[] = []): Response {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
    "Referrer-Policy": "no-referrer",
  });
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return new Response(JSON.stringify(body), { status, headers });
}

async function boundedBody(request: Request): Promise<unknown> {
  if (
    request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json" ||
    !request.body
  )
    throw new RangeError("REQUEST_INVALID");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 4096) {
        await reader.cancel();
        throw new RangeError("REQUEST_INVALID");
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally {
    reader.releaseLock();
  }
}

/** Public authentication seam. No account exists until the emailed token is redeemed. */
export function createMagicLinkHttpHandlers(dependencies: {
  origin: string;
  clock: Clock;
  protector: FieldProtector;
  repository: MagicLinkRepository;
  sender: MagicLinkSender;
  /** Shared edge/client abuse budget; derive client identity only from trusted deployment metadata. */
  requestBudget: { consume(request: Request): Promise<boolean> };
}): MagicLinkHttpHandlers {
  const origin = new URL(dependencies.origin);
  if (origin.protocol !== "https:" || origin.origin !== dependencies.origin)
    throw new RangeError("AUTH_ORIGIN_INVALID");
  async function guard(request: Request): Promise<Response | null> {
    if (request.method !== "POST") return response(405, { code: "METHOD_NOT_ALLOWED" });
    if (request.headers.get("origin") !== origin.origin)
      return response(403, { code: "ORIGIN_REQUIRED" });
    if (!(await dependencies.requestBudget.consume(request)))
      return response(429, { code: "RATE_LIMITED" });
    return null;
  }
  return {
    async requestLink(request) {
      try {
        const denied = await guard(request);
        if (denied) return denied;
        let input: z.infer<typeof inputSchema>;
        try {
          input = inputSchema.parse(await boundedBody(request));
        } catch {
          return response(400, { code: "REQUEST_INVALID" });
        }
        const now = dependencies.clock.now();
        if (!Number.isFinite(now.valueOf())) throw new Error("CLOCK_INVALID");
        const browser = browserToken(request) ?? randomBytes(32).toString("base64url");
        const token = randomBytes(32).toString("base64url");
        const id = randomUUID();
        const expiresAt = new Date(now.valueOf() + LINK_MS);
        const email = await dependencies.protector.protect(input.email, "principal_email");
        const issued = await dependencies.repository.issue({
          id,
          emailLookupHmac: await dependencies.protector.lookup(input.email, "principal_email"),
          emailCiphertext: serializeProtectedField(email),
          emailKeyVersion: email.keyVersion,
          locale: input.locale,
          tokenDigest: digest("magic-link", token),
          browserDigest: digest("login-browser", browser),
          now,
          expiresAt,
        });
        if (issued) {
          try {
            await dependencies.sender.send(
              { email: input.email, url: `${origin.origin}/sign-in/confirm#${token}`, expiresAt },
              AbortSignal.timeout(10000),
            );
          } catch {
            await dependencies.repository.revokeChallenge(id, now);
            return response(503, { code: "SIGN_IN_UNAVAILABLE" });
          }
        }
        return response(
          202,
          { message: "If delivery is available, a sign-in link will arrive shortly." },
          [
            `${LOGIN_COOKIE}=${browser}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${LINK_MS / 1000}`,
          ],
        );
      } catch {
        return response(503, { code: "SIGN_IN_UNAVAILABLE" });
      }
    },
    async consumeLink(request) {
      try {
        const denied = await guard(request);
        if (denied) return denied;
        let token: string;
        try {
          token = consumeSchema.parse(await boundedBody(request)).token;
        } catch {
          return response(400, { code: "REQUEST_INVALID" });
        }
        const browser = browserToken(request);
        if (browser === null) return response(401, { code: "LINK_INVALID_OR_EXPIRED" });
        const now = dependencies.clock.now();
        if (!Number.isFinite(now.valueOf())) throw new Error("CLOCK_INVALID");
        const session = randomBytes(32).toString("base64url");
        const csrf = randomBytes(32).toString("base64url");
        const consumed = await dependencies.repository.consume({
          tokenDigest: digest("magic-link", token),
          browserDigest: digest("login-browser", browser),
          now,
          principalId: randomUUID(),
          sessionId: randomUUID(),
          sessionDigest: digest("session", session),
          csrfDigest: digest("csrf", csrf),
          expiresAt: new Date(now.valueOf() + SESSION_MS),
        });
        if (!consumed) return response(401, { code: "LINK_INVALID_OR_EXPIRED" });
        return response(200, { authenticated: true }, [
          `__Host-numerology_session=${session}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_MS / 1000}`,
          `__Host-numerology_csrf=${csrf}; Path=/; Secure; SameSite=Strict; Max-Age=${SESSION_MS / 1000}`,
          `${LOGIN_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
        ]);
      } catch {
        return response(503, { code: "SIGN_IN_UNAVAILABLE" });
      }
    },
  };
}
