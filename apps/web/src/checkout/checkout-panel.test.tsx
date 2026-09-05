// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://numerology.test/en-IN/intake/00000000-0000-4000-8000-000000000003/preview"}
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CheckoutPanel } from "./checkout-panel";

const intentId = "00000000-0000-4000-8000-000000000003";
const orderId = "00000000-0000-4000-8000-000000000050";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.querySelector('script[data-hosted-checkout="razorpay"]')?.remove();
  // biome-ignore lint/suspicious/noDocumentCookie: jsdom has no Cookie Store implementation.
  document.cookie = "__Host-numerology_csrf=; Max-Age=0; Path=/";
  Reflect.deleteProperty(window, "Razorpay");
});

it.each(["error", "timeout"])(
  "can reload hosted Checkout after a script %s without changing the order",
  async (failure) => {
    // biome-ignore lint/suspicious/noDocumentCookie: jsdom has no Cookie Store implementation.
    document.cookie = `__Host-numerology_csrf=${"a".repeat(43)}; Secure; Path=/`;
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation(async () => checkoutResponse()),
    );
    vi.useFakeTimers();
    render(<CheckoutPanel intentId={intentId} />);
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Pay ₹499 securely" })),
    );
    const failedScript = document.querySelector('script[data-hosted-checkout="razorpay"]');
    expect(failedScript).not.toBeNull();
    await act(async () => {
      if (failure === "error") fireEvent.error(failedScript as HTMLScriptElement);
      else await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(screen.getByRole("alert").textContent).toContain("not available");
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Resume secure checkout" })),
    );
    const replacement = document.querySelector('script[data-hosted-checkout="razorpay"]');
    expect(replacement).not.toBeNull();
    expect(replacement).not.toBe(failedScript);
    const openedOrders: unknown[] = [];
    Object.assign(window, {
      Razorpay: class {
        constructor(readonly options: Record<string, unknown>) {}
        on = vi.fn();
        open() {
          openedOrders.push(this.options.order_id);
        }
      },
    });
    await act(async () => fireEvent.load(replacement as HTMLScriptElement));
    expect(openedOrders).toEqual(["order_provider_50"]);
  },
);

function checkoutResponse(status = "pending", checkoutAvailable = true) {
  return Response.json({
    checkout: checkoutAvailable
      ? {
          description: "Personal numerology report",
          keyId: "rzp_test_public",
          name: "Numerology Report",
          providerOrderId: "order_provider_50",
        }
      : null,
    order: { amountPaise: 49_900, currency: "INR", id: orderId, status },
  });
}

it.each(["pending", "failed"])(
  "does not turn uncertain browser success into another purchase on stale %s status",
  async (status) => {
    // biome-ignore lint/suspicious/noDocumentCookie: jsdom has no Cookie Store implementation.
    document.cookie = `__Host-numerology_csrf=${"a".repeat(43)}; Secure; Path=/`;
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(checkoutResponse())
        .mockRejectedValueOnce(new Error("connection lost"))
        .mockResolvedValueOnce(
          Response.json({ order: { id: orderId, amountPaise: 49_900, currency: "INR", status } }),
        ),
    );
    Object.assign(window, {
      Razorpay: class {
        constructor(readonly options: Record<string, unknown>) {}
        on() {}
        open() {
          (this.options.handler as (result: unknown) => void)({
            razorpay_order_id: "order_provider_50",
            razorpay_payment_id: "pay_provider_50",
            razorpay_signature: "a".repeat(64),
          });
          (this.options.modal as { ondismiss: () => void }).ondismiss();
        }
      },
    });
    render(<CheckoutPanel intentId={intentId} />);
    fireEvent.click(screen.getByRole("button", { name: "Pay ₹499 securely" }));
    await screen.findByText(/Please do not pay again/u);
    fireEvent.click(screen.getByRole("button", { name: "Check payment status" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Check payment status" }).hasAttribute("disabled"),
      ).toBe(false),
    );
    expect(screen.getByText(/Please do not pay again/u)).toBeDefined();
    expect(screen.queryByRole("button", { name: "Resume secure checkout" })).toBeNull();
  },
);

it.each([true, false])(
  "keeps an ambiguous existing order out of hosted Checkout (checkout available: %s)",
  async (checkoutAvailable) => {
    // biome-ignore lint/suspicious/noDocumentCookie: jsdom has no Cookie Store implementation.
    document.cookie = `__Host-numerology_csrf=${"a".repeat(43)}; Secure; Path=/`;
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(checkoutResponse("ambiguous", checkoutAvailable)),
    );
    const open = vi.fn();
    Object.assign(window, {
      Razorpay: class {
        open = open;
        on = vi.fn();
      },
    });

    render(<CheckoutPanel intentId={intentId} />);
    fireEvent.click(screen.getByRole("button", { name: "Pay ₹499 securely" }));

    await screen.findByText(/Please do not pay again/u);
    expect(open).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Pay ₹499/u })).toBeNull();
    expect(screen.getByRole("button", { name: "Check payment status" })).toBeDefined();
  },
);

it.each(["pending", "ambiguous"])(
  "rechecks a dismissed checkout before resuming when the server now says %s",
  async (resumedStatus) => {
    // biome-ignore lint/suspicious/noDocumentCookie: jsdom has no Cookie Store implementation.
    document.cookie = `__Host-numerology_csrf=${"a".repeat(43)}; Secure; Path=/`;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(checkoutResponse())
      .mockResolvedValueOnce(checkoutResponse(resumedStatus, resumedStatus === "pending"));
    vi.stubGlobal("fetch", fetcher);
    const openedOrders: unknown[] = [];
    Object.assign(window, {
      Razorpay: class {
        constructor(readonly options: Record<string, unknown>) {}
        on = vi.fn();
        open() {
          openedOrders.push(this.options.order_id);
          (this.options.modal as { ondismiss: () => void }).ondismiss();
        }
      },
    });

    render(<CheckoutPanel intentId={intentId} />);
    fireEvent.click(screen.getByRole("button", { name: "Pay ₹499 securely" }));
    fireEvent.click(await screen.findByRole("button", { name: "Resume secure checkout" }));

    if (resumedStatus === "ambiguous") {
      await screen.findByText(/Please do not pay again/u);
      expect(openedOrders).toEqual(["order_provider_50"]);
      expect(screen.queryByRole("button", { name: "Resume secure checkout" })).toBeNull();
    } else {
      await screen.findByRole("button", { name: "Resume secure checkout" });
      expect(openedOrders).toEqual(["order_provider_50", "order_provider_50"]);
    }
    expect(new Headers(fetcher.mock.calls[1]?.[1]?.headers).get("idempotency-key")).toBe(
      new Headers(fetcher.mock.calls[0]?.[1]?.headers).get("idempotency-key"),
    );
  },
);

it("opens hosted Checkout for exactly ₹499 and treats browser success only as server proof", async () => {
  // biome-ignore lint/suspicious/noDocumentCookie: jsdom has no Cookie Store implementation.
  document.cookie = `__Host-numerology_csrf=${"a".repeat(43)}; Secure; Path=/`;
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(checkoutResponse())
    .mockResolvedValueOnce(
      Response.json({
        order: { amountPaise: 49_900, currency: "INR", id: orderId, status: "paid" },
      }),
    );
  vi.stubGlobal("fetch", fetcher);
  const open = vi.fn();
  class HostedCheckout {
    readonly options: Record<string, unknown>;
    constructor(options: Record<string, unknown>) {
      this.options = options;
    }
    open = open.mockImplementation(() => {
      const handler = this.options.handler as (proof: Record<string, string>) => void;
      handler({
        razorpay_order_id: "order_provider_50",
        razorpay_payment_id: "pay_provider_50",
        razorpay_signature: "a".repeat(64),
      });
    });
    on = vi.fn();
  }
  Object.assign(window, { Razorpay: HostedCheckout });

  render(<CheckoutPanel intentId={intentId} />);
  expect(screen.getByText("Total")).toBeDefined();
  expect(screen.getByText("₹499")).toBeDefined();
  expect(document.body.textContent).not.toMatch(/GST|tax included/iu);
  fireEvent.click(screen.getByRole("button", { name: "Pay ₹499 securely" }));

  await screen.findByText(/Payment confirmed/u);
  expect(open).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0]?.[0]).toBe(`/api/v1/report-intents/${intentId}/checkout`);
  expect(fetcher.mock.calls[1]?.[0]).toBe(`/api/v1/orders/${orderId}/proof`);
  const proof = JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body));
  expect(proof).toEqual({
    paymentId: "pay_provider_50",
    providerOrderId: "order_provider_50",
    signature: "a".repeat(64),
  });
  expect(new Headers(fetcher.mock.calls[1]?.[1]?.headers).get("x-csrf-token")).toBe("a".repeat(43));
});

it("keeps timeout and callback-only outcomes ambiguous and offers status recovery without repurchase copy", async () => {
  // biome-ignore lint/suspicious/noDocumentCookie: jsdom has no Cookie Store implementation.
  document.cookie = `__Host-numerology_csrf=${"b".repeat(43)}; Secure; Path=/`;
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(checkoutResponse())
    .mockResolvedValueOnce(
      Response.json({
        order: { amountPaise: 49_900, currency: "INR", id: orderId, status: "ambiguous" },
      }),
    )
    .mockResolvedValueOnce(
      Response.json({
        order: { amountPaise: 49_900, currency: "INR", id: orderId, status: "paid" },
      }),
    );
  vi.stubGlobal("fetch", fetcher);
  class HostedCheckout {
    readonly options: Record<string, unknown>;
    constructor(options: Record<string, unknown>) {
      this.options = options;
    }
    open() {
      (this.options.handler as (proof: Record<string, string>) => void)({
        razorpay_order_id: "order_provider_50",
        razorpay_payment_id: "pay_provider_50",
        razorpay_signature: "c".repeat(64),
      });
    }
    on = vi.fn();
  }
  Object.assign(window, { Razorpay: HostedCheckout });

  render(<CheckoutPanel intentId={intentId} />);
  fireEvent.click(screen.getByRole("button", { name: "Pay ₹499 securely" }));
  await screen.findByText(/still verifying/u);
  expect(document.body.textContent).not.toMatch(/try another payment|payment failed/iu);
  fireEvent.click(screen.getByRole("button", { name: "Check payment status" }));
  await screen.findByText(/Payment confirmed/u);
  expect(fetcher.mock.calls[2]?.[0]).toBe(`/api/v1/orders/${orderId}/proof`);
});

it.each([
  { amountPaise: 500, keyId: "rzp_test_public" },
  { amountPaise: 49_900, keyId: "rzp_live_public" },
])(
  "fails closed on malformed money or live credentials and never opens hosted Checkout: %j",
  async ({ amountPaise, keyId }) => {
    // biome-ignore lint/suspicious/noDocumentCookie: jsdom has no Cookie Store implementation.
    document.cookie = `__Host-numerology_csrf=${"d".repeat(43)}; Secure; Path=/`;
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        Response.json({
          checkout: {
            description: "Personal numerology report",
            keyId,
            name: "Numerology Report",
            providerOrderId: "order_provider_50",
          },
          order: { amountPaise, currency: "INR", id: orderId, status: "paid" },
        }),
      ),
    );
    const open = vi.fn();
    Object.assign(window, {
      Razorpay: class {
        open = open;
        on = vi.fn();
      },
    });

    render(<CheckoutPanel intentId={intentId} />);
    fireEvent.click(screen.getByRole("button", { name: "Pay ₹499 securely" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("not available"));
    expect(open).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("500");
  },
);
