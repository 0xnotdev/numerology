// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://numerology.test/sign-in/confirm"}
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ConfirmSignIn } from "./confirm-sign-in";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("cleans the link token before redemption and opens the private account after sign-in", async () => {
  const token = "A".repeat(43);
  window.history.replaceState(null, "", `/sign-in/confirm#${token}`);
  const navigate = vi.fn();
  const fetcher = vi.fn<typeof fetch>(async () => {
    expect(window.location.hash).toBe("");
    return Response.json({});
  });
  vi.stubGlobal("fetch", fetcher);
  render(<ConfirmSignIn navigate={navigate} />);
  fireEvent.click(await screen.findByRole("button", { name: "Confirm sign-in" }));
  await waitFor(() => expect(navigate).toHaveBeenCalledWith("/en-IN/account"));
  expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({ token });
  expect(window.localStorage.length).toBe(0);
  expect(window.sessionStorage.length).toBe(0);
});
