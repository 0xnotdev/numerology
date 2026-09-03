import type { ReportIntentHttpHandlers } from "@numerology/application";

export interface ReportIntentRouteContext {
  readonly params: Promise<{ intentId: string }>;
}

export interface ReportIntentRouteAdapters {
  readonly complete: (request: Request, context: ReportIntentRouteContext) => Promise<Response>;
  readonly create: (request: Request) => Promise<Response>;
  readonly get: (request: Request, context: ReportIntentRouteContext) => Promise<Response>;
  readonly patch: (request: Request, context: ReportIntentRouteContext) => Promise<Response>;
  readonly preview: (request: Request, context: ReportIntentRouteContext) => Promise<Response>;
}

export type ReportIntentHandlerResolver = () => ReportIntentHttpHandlers | null;

function unavailable(): Response {
  return new Response(
    JSON.stringify({
      code: "REPORT_INTENT_UNAVAILABLE",
      status: 503,
      title: "Request could not be completed.",
      type: "https://numerology.example/problems/REPORT_INTENT_UNAVAILABLE",
    }),
    {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/problem+json",
      },
      status: 503,
    },
  );
}

async function route(
  resolve: ReportIntentHandlerResolver,
  invoke: (handlers: ReportIntentHttpHandlers) => Promise<Response>,
): Promise<Response> {
  try {
    const handlers = resolve();
    return handlers === null ? unavailable() : await invoke(handlers);
  } catch {
    return unavailable();
  }
}

async function intentId(context: ReportIntentRouteContext): Promise<string> {
  const params = await context.params;
  return params.intentId;
}

export function createReportIntentRouteAdapters(
  resolve: ReportIntentHandlerResolver,
): ReportIntentRouteAdapters {
  return {
    async complete(request, context) {
      return route(resolve, async (handlers) =>
        handlers.complete(request, await intentId(context)),
      );
    },
    async create(request) {
      return route(resolve, (handlers) => handlers.create(request));
    },
    async get(request, context) {
      return route(resolve, async (handlers) => handlers.get(request, await intentId(context)));
    },
    async patch(request, context) {
      return route(resolve, async (handlers) => handlers.patch(request, await intentId(context)));
    },
    async preview(request, context) {
      return route(resolve, async (handlers) => handlers.preview(request, await intentId(context)));
    },
  };
}
