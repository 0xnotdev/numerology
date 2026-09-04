import { describe, expect, it } from "vitest";
import { createSesMagicLinkSender } from "./ses-magic-link-sender";

describe("SES magic-link delivery", () => {
  it("sends a plain-text, fixed-subject transactional email and forwards cancellation", async () => {
    const signal = new AbortController().signal;
    const sender = createSesMagicLinkSender("signin@example.invalid", {
      send: async (command, options) => {
        expect(options.abortSignal).toBe(signal);
        expect(command.input.FromEmailAddress).toBe("signin@example.invalid");
        expect(command.input.Destination).toEqual({ ToAddresses: ["reader@example.invalid"] });
        expect(command.input.Content?.Simple?.Subject?.Data).toBe(
          "Your sign-in link for The Numbered Life",
        );
        expect(command.input.Content?.Simple?.Body?.Text?.Data).toContain(
          "https://example.test/sign-in/confirm#opaque-token",
        );
        expect(command.input.Content?.Simple?.Body?.Html).toBeUndefined();
        return {};
      },
    });
    await sender.send(
      {
        email: "reader@example.invalid",
        url: "https://example.test/sign-in/confirm#opaque-token",
        expiresAt: new Date("2026-09-04T11:10:00Z"),
      },
      signal,
    );
    expect(() =>
      createSesMagicLinkSender("sender@example.invalid\r\nBCC: attacker@example.invalid"),
    ).toThrow("AUTH_SENDER_INVALID");
  });
});
