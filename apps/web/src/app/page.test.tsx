import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import HomePage from "./page";

describe("home sign-in navigation", () => {
  it("links existing customers to sign-in without claiming unavailable draft saving", () => {
    const html = renderToStaticMarkup(<HomePage />);
    expect(html).toContain('href="/sign-in"');
    expect(html).not.toContain("Your draft is saved securely");
  });
});
