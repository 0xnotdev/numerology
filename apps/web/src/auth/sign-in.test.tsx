import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createMagicLinkRoutes } from "../server/magic-link-routes";
import { ConfirmSignIn } from "./confirm-sign-in";
import { SignInForm } from "./sign-in-form";

describe("magic-link pages and route boundary", () => {
  it("explains the same-browser requirement and requires explicit confirmation", () => {
    const signIn = renderToStaticMarkup(<SignInForm />);
    expect(signIn).toContain('type="email"');
    expect(signIn).toContain('autoComplete="email"');
    expect(signIn).toContain("same browser");
    expect(signIn).toContain("10 minutes");
    const confirm = renderToStaticMarkup(<ConfirmSignIn />);
    expect(confirm).toContain("Confirm sign-in");
    expect(confirm).toContain("disabled");
    expect(confirm).not.toContain("localStorage");
  });
  it("fails closed before live configuration and hides provider errors", async () => {
    const request = new Request("https://example.test/api/v1/auth/magic-link", { method: "POST" });
    expect((await createMagicLinkRoutes(() => null).requestLink(request)).status).toBe(503);
    const broken = createMagicLinkRoutes(() => {
      throw new Error("private credentials");
    });
    const result = await broken.consumeLink(request);
    expect(await result.json()).toEqual({ code: "SIGN_IN_UNAVAILABLE" });
    expect(result.headers.get("cache-control")).toBe("no-store");
  });
});
