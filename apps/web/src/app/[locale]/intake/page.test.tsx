import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ExistingIntakePage from "./[intentId]/[step]/page";
import IntakePage, { metadata } from "./page";

describe("localized intake route", () => {
  it("renders the private intake for a supported locale", async () => {
    const page = await IntakePage({ params: Promise.resolve({ locale: "or-IN" }) });
    const html = renderToStaticMarkup(page);

    expect(html).toContain("Secure submission is not open");
    expect(html).not.toContain('name="birthName"');
  });

  it("marks intake as private and non-indexable", () => {
    expect(metadata.robots).toEqual({ follow: false, index: false, nocache: true });
  });

  it("does not let an unhydrated deep link bypass the first question", async () => {
    const page = await ExistingIntakePage({
      params: Promise.resolve({
        intentId: "00000000-0000-4000-8000-000000000099",
        locale: "en-IN",
        step: "preview",
      }),
    });
    const html = renderToStaticMarkup(page);

    expect(html).toContain("Secure submission is not open");
    expect(html).not.toContain("Preview before payment");
  });
});
