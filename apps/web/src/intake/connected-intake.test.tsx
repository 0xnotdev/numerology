// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://numerology.test/en-IN/intake"}
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ConnectedIntake } from "./connected-intake";
import { PRIVACY_NOTICE_VERSION } from "./privacy-notice";

const id = "00000000-0000-4000-8000-000000000003";
const identity = {
  controllerName: "Synthetic test controller",
  contactEmail: "privacy@example.invalid",
};
const completeDraft = {
  schemaVersion: "1.0.0",
  locale: "en-IN",
  subject: {
    dateOfBirth: "1990-08-12",
    names: [
      { kind: "birth_full", value: "Anita Rao" },
      { kind: "current_full", value: "Anita Rao" },
    ],
  },
  delivery: { email: "person@example.invalid" },
  consents: {
    requiredProcessing: true,
    analytics: false,
    marketingEmail: false,
    noticeVersion: PRIVACY_NOTICE_VERSION,
  },
};
function response(draft: unknown, version = 1, status = "draft") {
  return Response.json({ draft, intent: { id, version, status, locale: "en-IN" } });
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});

it("collects locally before consent, securely saves, completes and renders the actual three-number preview", async () => {
  document.cookie = `__Host-numerology_csrf=${"a".repeat(43)}; Secure; Path=/`;
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(response({ schemaVersion: "1.0.0", locale: "en-IN" }))
    .mockResolvedValueOnce(response(completeDraft, 2))
    .mockResolvedValueOnce(response(completeDraft, 3, "complete"))
    .mockResolvedValueOnce(
      Response.json({
        locale: "en-IN",
        values: [
          { label: "Life path", value: "3" },
          { label: "Expression", value: "7" },
          { label: "Personal year", value: "4" },
        ],
      }),
    );
  vi.stubGlobal("fetch", fetcher);
  render(<ConnectedIntake asOfDate="2026-09-04" locale="en-IN" privacyIdentity={identity} />);
  fireEvent.change(screen.getByLabelText("Your birth name"), { target: { value: "Anita Rao" } });
  fireEvent.change(screen.getByLabelText("The name you use now"), {
    target: { value: "Anita Rao" },
  });
  fireEvent.click(screen.getByRole("button", { name: /Next question/u }));
  await screen.findByLabelText("Your date of birth", { selector: "input" });
  fireEvent.change(screen.getByLabelText("Your date of birth", { selector: "input" }), {
    target: { value: "1990-08-12" },
  });
  fireEvent.click(screen.getByRole("button", { name: /Next question/u }));
  await screen.findByLabelText("Email address");
  expect(fetcher).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Email address"), {
    target: { value: "person@example.invalid" },
  });
  fireEvent.click(screen.getByRole("checkbox", { name: /Required: I have read/u }));
  fireEvent.click(screen.getByRole("button", { name: /Next question/u }));
  await screen.findByText("Review your details");
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(window.sessionStorage)).not.toContain("Anita");
  expect(JSON.stringify(window.sessionStorage)).not.toContain("1990-08-12");
  fireEvent.click(screen.getByRole("button", { name: /Continue/u }));
  await screen.findByText("Life path");
  expect(screen.getByText("Expression")).toBeDefined();
  expect(fetcher).toHaveBeenCalledTimes(4);
  expect((screen.getByRole("button", { name: /Name/u }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.queryByText(/confidence|ranking|reportHash/u)).toBeNull();
});

it("loads authenticated server answers before showing a resume step and cannot bypass missing answers", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(response({ schemaVersion: "1.0.0", locale: "en-IN" }));
  vi.stubGlobal("fetch", fetcher);
  render(
    <ConnectedIntake
      asOfDate="2026-09-04"
      locale="en-IN"
      privacyIdentity={identity}
      intentId={id}
      initialStep="preview"
    />,
  );
  expect(screen.getByRole("status").textContent).toContain("Loading");
  await screen.findByLabelText("Your birth name");
  expect(screen.queryByText("Preview before payment")).toBeNull();
});

it("keeps unauthorized answers hidden and leaves unsupported locale submission closed", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json({ detail: "private canary" }, { status: 401 }));
  vi.stubGlobal("fetch", fetcher);
  const view = render(
    <ConnectedIntake
      asOfDate="2026-09-04"
      locale="en-IN"
      privacyIdentity={identity}
      intentId={id}
    />,
  );
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Sign in"));
  expect(screen.queryByLabelText("Your birth name")).toBeNull();
  expect(screen.queryByText("private canary")).toBeNull();
  view.unmount();
  render(<ConnectedIntake asOfDate="2026-09-04" locale="hi-IN" privacyIdentity={identity} />);
  expect(screen.getByText(/Secure submission is not open/u)).toBeDefined();
  expect(fetcher).toHaveBeenCalledTimes(1);
});
