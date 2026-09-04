import { createHash } from "node:crypto";
import type { DatabasePool } from "@numerology/database/pool";
import { revokePostgresSession } from "@numerology/database/session-repository";

const runtimeKey = Symbol.for("numerology.logout-runtime");
type LogoutHandler = (request: Request) => Promise<Response>;
type Runtime = typeof globalThis & { [runtimeKey]?: LogoutHandler };
const TOKEN = /^[A-Za-z0-9_-]{43}$/u;

function cookie(request: Request, name: string): string | null {
  const values = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${name}=`))
    .map((part) => part.slice(name.length + 1));
  return values.length === 1 && TOKEN.test(values[0] ?? "") ? (values[0] ?? null) : null;
}
const cleared = [
  "__Host-numerology_session=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0",
  "__Host-numerology_csrf=; Path=/; Secure; SameSite=Strict; Max-Age=0",
  "report_draft=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0",
];

export function createLogoutHandler(options: {
  pool: DatabasePool;
  origin: string;
  now?: () => Date;
}): LogoutHandler {
  const origin = new URL(options.origin);
  if (origin.protocol !== "https:" || origin.origin !== options.origin)
    throw new RangeError("LOGOUT_CONFIGURATION_INVALID");
  return async (request) => {
    if (request.method !== "POST" || request.headers.get("origin") !== options.origin)
      return Response.json(
        { code: "CSRF_REQUIRED" },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    const session = cookie(request, "__Host-numerology_session");
    const csrf = cookie(request, "__Host-numerology_csrf");
    if (!session || !csrf || request.headers.get("x-csrf-token") !== csrf)
      return Response.json(
        { code: "CSRF_REQUIRED" },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    try {
      await revokePostgresSession(
        options.pool,
        createHash("sha256").update(`numerology:session:v1:${session}`).digest(),
        createHash("sha256").update(`numerology:csrf:v1:${csrf}`).digest(),
        options.now?.() ?? new Date(),
      );
      const headers = new Headers({ "Cache-Control": "no-store" });
      for (const value of cleared) headers.append("Set-Cookie", value);
      return new Response(null, { status: 204, headers });
    } catch {
      return Response.json(
        { code: "LOGOUT_UNAVAILABLE" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
  };
}
export function registerLogoutHandler(handler: LogoutHandler): void {
  const target = globalThis as Runtime;
  if (target[runtimeKey] && target[runtimeKey] !== handler)
    throw new Error("LOGOUT_RUNTIME_ALREADY_REGISTERED");
  target[runtimeKey] = handler;
}
export async function logoutRoute(request: Request): Promise<Response> {
  const handler = (globalThis as Runtime)[runtimeKey];
  return handler
    ? handler(request)
    : Response.json(
        { code: "LOGOUT_UNAVAILABLE" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
}
