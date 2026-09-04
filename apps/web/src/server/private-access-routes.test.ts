import type { PrivateAccessHttpHandlers } from "@numerology/application";
import { describe, expect, it, vi } from "vitest";
import { createPrivateAccessRouteAdapters } from "./private-access-routes";

function handlers(): PrivateAccessHttpHandlers {
  return {
    account: vi.fn(async () => new Response("account")),
    lifecycle: vi.fn(async (_request, id) => new Response(`lifecycle:${id}`)),
    report: vi.fn(async (_request, id) => new Response(`report:${id}`)),
    revokeAll: vi.fn(async () => new Response(null, { status: 204 })),
    signedPdf: vi.fn(async (_request, id) => new Response(`pdf:${id}`)),
  };
}

describe("Next private-access route adapters", () => {
  it("forwards requests and untrusted route ids only to the application boundary", async () => {
    const application = handlers();
    const routes = createPrivateAccessRouteAdapters(() => application);
    const request = new Request("https://numerology.test/api/v1/account");
    const context = { params: Promise.resolve({ reportId: "opaque-id" }) };

    await expect((await routes.account(request)).text()).resolves.toBe("account");
    await expect((await routes.report(request, context)).text()).resolves.toBe("report:opaque-id");
    await expect((await routes.lifecycle(request, context)).text()).resolves.toBe(
      "lifecycle:opaque-id",
    );
    await expect((await routes.signedPdf(request, context)).text()).resolves.toBe("pdf:opaque-id");
    expect((await routes.revokeAll(request)).status).toBe(204);
    expect(application.report).toHaveBeenCalledWith(request, "opaque-id");
  });

  it("fails closed with private response policy when production composition is absent", async () => {
    const response = await createPrivateAccessRouteAdapters(() => null).account(
      new Request("https://numerology.test/api/v1/account"),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(await response.json()).toEqual({
      code: "PRIVATE_ACCESS_UNAVAILABLE",
      status: 503,
      title: "Request could not be completed.",
      type: "https://numerology.example/problems/PRIVATE_ACCESS_UNAVAILABLE",
    });
  });

  it("collapses composition failures without reflecting secrets or request data", async () => {
    const routes = createPrivateAccessRouteAdapters(() => {
      throw new Error("DATABASE_URL=secret@example.test");
    });
    const response = await routes.revokeAll(
      new Request("https://numerology.test/api/v1/auth/revoke-all", {
        body: JSON.stringify({ email: "person@example.test" }),
        method: "POST",
      }),
    );

    const body = await response.text();
    expect(response.status).toBe(503);
    expect(body).not.toContain("secret@example.test");
    expect(body).not.toContain("person@example.test");
  });
});
