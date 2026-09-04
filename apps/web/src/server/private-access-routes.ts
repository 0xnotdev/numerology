import type { PrivateAccessHttpHandlers } from "@numerology/application";

export interface PrivateReportRouteContext {
  readonly params: Promise<{ reportId: string }>;
}

export interface PrivateAccessRouteAdapters {
  readonly account: (request: Request) => Promise<Response>;
  readonly lifecycle: (request: Request, context: PrivateReportRouteContext) => Promise<Response>;
  readonly report: (request: Request, context: PrivateReportRouteContext) => Promise<Response>;
  readonly revokeAll: (request: Request) => Promise<Response>;
  readonly signedPdf: (request: Request, context: PrivateReportRouteContext) => Promise<Response>;
}

export type PrivateAccessHandlerResolver = () => PrivateAccessHttpHandlers | null;

function unavailable(): Response {
  return Response.json(
    {
      code: "PRIVATE_ACCESS_UNAVAILABLE",
      status: 503,
      title: "Request could not be completed.",
      type: "https://numerology.example/problems/PRIVATE_ACCESS_UNAVAILABLE",
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/problem+json",
        "Referrer-Policy": "no-referrer",
        "X-Robots-Tag": "noindex, nofollow",
      },
      status: 503,
    },
  );
}

async function route(
  resolve: PrivateAccessHandlerResolver,
  invoke: (handlers: PrivateAccessHttpHandlers) => Promise<Response>,
): Promise<Response> {
  try {
    const handlers = resolve();
    return handlers === null ? unavailable() : await invoke(handlers);
  } catch {
    return unavailable();
  }
}

async function reportId(context: PrivateReportRouteContext): Promise<string> {
  return (await context.params).reportId;
}

export function createPrivateAccessRouteAdapters(
  resolve: PrivateAccessHandlerResolver,
): PrivateAccessRouteAdapters {
  return {
    account: (request) => route(resolve, (handlers) => handlers.account(request)),
    lifecycle: (request, context) =>
      route(resolve, async (handlers) => handlers.lifecycle(request, await reportId(context))),
    report: (request, context) =>
      route(resolve, async (handlers) => handlers.report(request, await reportId(context))),
    revokeAll: (request) => route(resolve, (handlers) => handlers.revokeAll(request)),
    signedPdf: (request, context) =>
      route(resolve, async (handlers) => handlers.signedPdf(request, await reportId(context))),
  };
}
