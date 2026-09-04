import type { MagicLinkHttpHandlers } from "@numerology/application";

export function createMagicLinkRoutes(
  resolve: () => MagicLinkHttpHandlers | null,
): MagicLinkHttpHandlers {
  async function invoke(request: Request, method: keyof MagicLinkHttpHandlers) {
    try {
      const handlers = resolve();
      if (handlers) return await handlers[method](request);
    } catch {
      /* Fail closed; provider errors may include private request data. */
    }
    return new Response(JSON.stringify({ code: "SIGN_IN_UNAVAILABLE" }), {
      status: 503,
      headers: { "Cache-Control": "no-store", "Content-Type": "application/json" },
    });
  }
  return {
    requestLink: (request) => invoke(request, "requestLink"),
    consumeLink: (request) => invoke(request, "consumeLink"),
  };
}
