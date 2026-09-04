import { createHash, timingSafeEqual } from "node:crypto";
import type { PostgresMaintenanceRunner } from "@numerology/database/maintenance";
const key = Symbol.for("numerology.maintenance-runtime");
type Handler = (request: Request) => Promise<Response>;
type Runtime = typeof globalThis & { [key]?: Handler };
export function registerMaintenanceHandler(options: {
  runner: PostgresMaintenanceRunner;
  secret: string;
}): void {
  if (options.secret.length < 32) throw new RangeError("MAINTENANCE_SECRET_INVALID");
  const expected = createHash("sha256").update(options.secret).digest();
  const handler: Handler = async (request) => {
    if (request.method !== "POST")
      return new Response(null, {
        status: 405,
        headers: { Allow: "POST", "Cache-Control": "no-store" },
      });
    const authorization = request.headers.get("authorization") ?? "";
    const supplied = createHash("sha256")
      .update(authorization.startsWith("Bearer ") ? authorization.slice(7) : "")
      .digest();
    if (!timingSafeEqual(supplied, expected))
      return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
    try {
      return Response.json(await options.runner.run(new Date(), 100), {
        headers: { "Cache-Control": "no-store" },
      });
    } catch {
      return Response.json(
        { code: "MAINTENANCE_UNAVAILABLE" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
  };
  const target = globalThis as Runtime;
  if (target[key] && target[key] !== handler)
    throw new Error("MAINTENANCE_RUNTIME_ALREADY_REGISTERED");
  target[key] = handler;
}
export async function maintenanceRoute(request: Request): Promise<Response> {
  const handler = (globalThis as Runtime)[key];
  return handler ? handler(request) : new Response(null, { status: 404 });
}
