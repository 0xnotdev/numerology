import type { ReportIntentHttpHandlers } from "@numerology/application";
import { describe, expect, it, vi } from "vitest";
import { createReportIntentRouteAdapters } from "./report-intent-routes";

function handlers(): ReportIntentHttpHandlers {
  return {
    complete: vi.fn(async (_request, id) => new Response(`complete:${id}`)),
    create: vi.fn(async () => new Response("create")),
    get: vi.fn(async (_request, id) => new Response(`get:${id}`)),
    patch: vi.fn(async (_request, id) => new Response(`patch:${id}`)),
    preview: vi.fn(async (_request, id) => new Response(`preview:${id}`)),
  };
}

describe("Next report-intent route adapters", () => {
  it("forwards the request and opaque route id to the application boundary", async () => {
    const application = handlers();
    const routes = createReportIntentRouteAdapters(() => application);
    const request = new Request("https://example.test/api/v1/report-intents");
    const context = {
      params: Promise.resolve({ intentId: "0199a72d-3f45-7df1-a730-1722c2538a06" }),
    };

    expect((await routes.create(request)).status).toBe(200);
    await expect((await routes.get(request, context)).text()).resolves.toBe(
      "get:0199a72d-3f45-7df1-a730-1722c2538a06",
    );
    await expect((await routes.patch(request, context)).text()).resolves.toBe(
      "patch:0199a72d-3f45-7df1-a730-1722c2538a06",
    );
    await expect((await routes.complete(request, context)).text()).resolves.toBe(
      "complete:0199a72d-3f45-7df1-a730-1722c2538a06",
    );
    await expect((await routes.preview(request, context)).text()).resolves.toBe(
      "preview:0199a72d-3f45-7df1-a730-1722c2538a06",
    );
    expect(application.create).toHaveBeenCalledWith(request);
    expect(application.get).toHaveBeenCalledWith(request, "0199a72d-3f45-7df1-a730-1722c2538a06");
  });

  it("returns a uniform no-store problem when production composition is unavailable", async () => {
    const routes = createReportIntentRouteAdapters(() => null);
    const response = await routes.create(new Request("https://example.test"));

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-type")).toContain("application/problem+json");
    expect(await response.json()).toEqual({
      code: "REPORT_INTENT_UNAVAILABLE",
      status: 503,
      title: "Request could not be completed.",
      type: "https://numerology.example/problems/REPORT_INTENT_UNAVAILABLE",
    });
  });

  it("collapses composition errors without exposing configuration or request data", async () => {
    const routes = createReportIntentRouteAdapters(() => {
      throw new Error("DATABASE_URL=secret@example.test");
    });
    const response = await routes.create(
      new Request("https://example.test", {
        body: JSON.stringify({ email: "person@example.com" }),
        method: "POST",
      }),
    );

    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).not.toContain("secret@example.test");
    expect(body).not.toContain("person@example.com");
  });
});
