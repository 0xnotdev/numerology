import { checkDatabaseReadiness } from "../../../../server/database-readiness";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export interface ReadinessProbe {
  check(): Promise<boolean>;
}

export function createReadinessHandler(probe: ReadinessProbe): () => Promise<Response> {
  return async function readinessHandler(): Promise<Response> {
    let ready = false;
    try {
      ready = await probe.check();
    } catch {
      // Deliberately collapse configuration and dependency errors into one safe status.
    }

    return Response.json(
      {
        service: "numerology-web",
        status: ready ? "ok" : "unavailable",
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
        status: ready ? 200 : 503,
      },
    );
  };
}

export const GET = createReadinessHandler({ check: checkDatabaseReadiness });
