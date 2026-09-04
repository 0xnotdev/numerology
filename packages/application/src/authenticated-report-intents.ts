import { createHash, timingSafeEqual } from "node:crypto";
import {
  createReportIntentHttpHandlers,
  type ReportIntentHttpDependencies,
  type ReportIntentHttpHandlers,
} from "./report-intent-http";

export interface SessionRepository {
  /** Returns only active, unrevoked sessions whose idle and absolute deadlines are after now. */
  findActive(
    tokenDigest: Uint8Array,
    now: Date,
  ): Promise<{
    readonly principalId: string;
    readonly csrfDigest: Uint8Array;
  } | null>;
}

const TOKEN = /^[A-Za-z0-9_-]{43}$/u;
const COOKIE = "__Host-numerology_session";

function readToken(request: Request): string | null {
  const matches = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${COOKIE}=`));
  if (matches.length !== 1) return null;
  const token = matches[0]?.slice(COOKIE.length + 1) ?? "";
  return TOKEN.test(token) && Buffer.from(token, "base64url").toString("base64url") === token
    ? token
    : null;
}

/** Request-local ownership: no browser-supplied principal or shared mutable authentication state. */
export function createAuthenticatedReportIntentHandlers(dependencies: {
  readonly http: Omit<
    ReportIntentHttpDependencies,
    "createOwnerPrincipalId" | "ownerPrincipalId" | "readCsrf"
  >;
  readonly sessions: SessionRepository;
  readonly origin: string;
}): ReportIntentHttpHandlers {
  const origin = new URL(dependencies.origin);
  if (
    origin.protocol !== "https:" ||
    origin.origin !== dependencies.origin ||
    !dependencies.http.cookieSecure
  )
    throw new RangeError("AUTHENTICATED_INTAKE_CONFIGURATION_INVALID");

  async function dispatch(
    request: Request,
    invoke: (handlers: ReportIntentHttpHandlers) => Promise<Response>,
  ) {
    try {
      const token = readToken(request);
      const now = dependencies.http.clock.now();
      if (!Number.isFinite(now.valueOf())) throw new Error("SESSION_CLOCK_INVALID");
      const session =
        token === null
          ? null
          : await dependencies.sessions.findActive(
              createHash("sha256").update(`numerology:session:v1:${token}`).digest(),
              now,
            );
      const csrf = request.headers.get("x-csrf-token") ?? "";
      const digest = createHash("sha256").update(`numerology:csrf:v1:${csrf}`).digest();
      const csrfValid =
        session !== null &&
        TOKEN.test(csrf) &&
        session.csrfDigest.length === digest.length &&
        request.headers.get("origin") === dependencies.origin &&
        timingSafeEqual(digest, session.csrfDigest);
      return await invoke(
        createReportIntentHttpHandlers({
          ...dependencies.http,
          createOwnerPrincipalId: () => session?.principalId ?? null,
          ownerPrincipalId: () => session?.principalId ?? null,
          readCsrf: () => csrfValid,
        }),
      );
    } catch {
      return new Response(
        JSON.stringify({
          code: "AUTHENTICATION_UNAVAILABLE",
          status: 503,
          title: "Request could not be completed.",
          type: "https://numerology.example/problems/AUTHENTICATION_UNAVAILABLE",
        }),
        {
          status: 503,
          headers: { "Cache-Control": "no-store", "Content-Type": "application/problem+json" },
        },
      );
    }
  }
  return {
    create: (request) => dispatch(request, (handlers) => handlers.create(request)),
    get: (request, id) => dispatch(request, (handlers) => handlers.get(request, id)),
    patch: (request, id) => dispatch(request, (handlers) => handlers.patch(request, id)),
    complete: (request, id) => dispatch(request, (handlers) => handlers.complete(request, id)),
    preview: (request, id) => dispatch(request, (handlers) => handlers.preview(request, id)),
  };
}
