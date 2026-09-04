// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://numerology.test/en-IN/account"}
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountShell } from "./account-shell";
import { ReportShell } from "./report-shell";

const reportId = "00000000-0000-4000-8000-000000000041";
const projection = {
  locale: "en-IN",
  title: "Your Numerology Report",
  displayName: "Synthetic Reader",
  disclaimer: "Numerology is for reflection, not prediction or professional advice.",
  sections: [
    {
      order: 1,
      title: "Core numbers",
      blocks: [
        { type: "number_card", value: "7", caption: "Life path" },
        { type: "prose", paragraphs: ["A reflective paragraph."] },
        {
          type: "comparison",
          left: { label: "Birth", value: "3" },
          right: { label: "Current", value: "7" },
          body: "Two views.",
        },
        {
          type: "lo_shu",
          caption: "Birth grid",
          grid: Array.from({ length: 9 }, (_, index) => ({ digit: index + 1, count: index % 2 })),
        },
        { type: "timeline", items: [{ label: "2026", value: "4" }] },
        { type: "source_note", body: "Traditional method note." },
      ],
    },
  ],
  traditionalPractices: [
    {
      availability: "available",
      label: "Optional traditional practice",
      instruction: "Use as a reflection prompt.",
      optional: true,
      noPromisedResult: true,
    },
  ],
  practicalAlternatives: [
    {
      availability: "unavailable",
      label: "Practical alternative",
      message: "No practical alternative is attached.",
      optional: true,
      noPromisedResult: true,
    },
  ],
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  // biome-ignore lint/suspicious/noDocumentCookie: jsdom has no Cookie Store implementation.
  document.cookie = "__Host-numerology_csrf=; Max-Age=0; Path=/";
});

describe("private customer shells", () => {
  it("lists only safe entitled report metadata and supports all-device sign-out", async () => {
    // biome-ignore lint/suspicious/noDocumentCookie: jsdom has no Cookie Store implementation.
    document.cookie = `__Host-numerology_csrf=${"a".repeat(43)}; Secure; Path=/`;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          reports: [
            {
              id: reportId,
              title: "Your Numerology Report",
              locale: "en-IN",
              status: "ready",
              readyAt: "2026-09-04T00:00:00.000Z",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetcher);
    const assign = vi.fn();
    render(<AccountShell navigate={assign} />);
    expect(screen.getByRole("status").textContent).toContain("Loading");
    expect(
      (await screen.findByRole("link", { name: "Your Numerology Report" })).getAttribute("href"),
    ).toBe(`/en-IN/reports/${reportId}`);
    fireEvent.click(screen.getByRole("button", { name: /Sign out of all devices/u }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(fetcher.mock.calls[1]?.[0]).toBe("/api/v1/auth/revoke-all");
    expect(new Headers(fetcher.mock.calls[1]?.[1]?.headers).get("x-csrf-token")).toBe(
      "a".repeat(43),
    );
    expect(assign).toHaveBeenCalledWith("/sign-in");
    expect(document.body.textContent).not.toMatch(/principalId|email|entitlement/iu);
  });

  it("shows one safe state for an expired or revoked private session", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json({ code: "UNAUTHENTICATED" }, { status: 401 })),
    );
    render(<AccountShell />);

    expect((await screen.findByRole("alert")).textContent).toContain("expired or been revoked");
  });

  it("renders every customer report block without internal verification fields", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(Response.json(projection)));
    render(<ReportShell locale="en-IN" reportId={reportId} />);
    await screen.findByRole("heading", { name: "Your Numerology Report" });
    expect(screen.getByText("Life path")).toBeDefined();
    expect(screen.getByText("Two views.")).toBeDefined();
    expect(screen.getByText("Birth grid")).toBeDefined();
    expect(screen.getByText("2026")).toBeDefined();
    expect(screen.getByText("Optional traditional practice")).toBeDefined();
    expect(document.body.textContent).not.toMatch(
      /confidence|ranking|verification|reportHash|principalId/iu,
    );
  });

  it("shows the same private-not-found state without reflecting server details", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          Response.json(
            { code: "REPORT_NOT_FOUND", detail: "other-person@example.invalid" },
            { status: 404 },
          ),
        ),
    );
    render(<ReportShell locale="en-IN" reportId={reportId} />);
    await screen.findByRole("alert");
    expect(screen.getByRole("alert").textContent).toContain("not available");
    expect(document.body.textContent).not.toContain("other-person@example.invalid");
  });

  it("never exposes internal parser failures from an invalid private response", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json({ ...projection, principalId: "private-owner" })),
    );
    render(<ReportShell locale="en-IN" reportId={reportId} />);

    await screen.findByRole("alert");
    expect(screen.getByRole("alert").textContent).toContain("not available");
    expect(document.body.textContent).not.toContain("PRIVATE_RESPONSE_INVALID");
  });

  it("records a lifecycle request with an in-memory idempotency key and handles reauthentication", async () => {
    // biome-ignore lint/suspicious/noDocumentCookie: jsdom has no Cookie Store implementation.
    document.cookie = `__Host-numerology_csrf=${"a".repeat(43)}; Secure; Path=/`;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(projection))
      .mockResolvedValueOnce(Response.json({ code: "REAUTHENTICATION_REQUIRED" }, { status: 401 }));
    vi.stubGlobal("fetch", fetcher);
    render(<ReportShell locale="en-IN" reportId={reportId} />);
    await screen.findByText("Life path");
    fireEvent.click(screen.getByRole("button", { name: /Request data export/u }));
    await screen.findByText(/sign in again/u);
    expect(new Headers(fetcher.mock.calls[1]?.[1]?.headers).get("Idempotency-Key")).toMatch(
      /^[0-9a-f-]{36}$/u,
    );
    expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toEqual({ action: "export" });
  });

  it("does not claim acceptance for a malformed lifecycle receipt", async () => {
    // biome-ignore lint/suspicious/noDocumentCookie: jsdom has no Cookie Store implementation.
    document.cookie = `__Host-numerology_csrf=${"a".repeat(43)}; Secure; Path=/`;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(projection))
      .mockResolvedValueOnce(Response.json({ status: "complete" }, { status: 202 }));
    vi.stubGlobal("fetch", fetcher);
    render(<ReportShell locale="en-IN" reportId={reportId} />);
    await screen.findByText("Life path");

    fireEvent.click(screen.getByRole("button", { name: /Request a correction/u }));
    await screen.findByText(/temporarily unavailable/u);
    expect(document.body.textContent).not.toContain("request received");
  });
});
