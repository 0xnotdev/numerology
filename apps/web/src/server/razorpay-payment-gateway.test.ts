import { describe, expect, it, vi } from "vitest";
import { createRazorpayPaymentGateway } from "./razorpay-payment-gateway";

const keyId = "rzp_test_1234567890abcd";
const keySecret = "synthetic-secret-never-log";

function response(value: unknown, status = 200): Response {
  return Response.json(value, { status });
}

describe("Razorpay payment gateway adapter", () => {
  it("uses authenticated server APIs and preserves the exact order contract", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response({
          amount: 49_900,
          amount_due: 49_900,
          amount_paid: 0,
          attempts: 0,
          created_at: 1_788_476_400,
          currency: "INR",
          entity: "order",
          id: "order_9A33XWu170gUtm",
          notes: { local_order_id: "0199a72d-3f45-7df1-a730-1722c2538a02" },
          offer_id: null,
          receipt: "0199a72d-3f45-7df1-a730-1722c2538a02",
          status: "created",
        }),
      )
      .mockResolvedValueOnce(
        response({
          amount: 49_900,
          currency: "INR",
          entity: "order",
          id: "order_9A33XWu170gUtm",
          receipt: "0199a72d-3f45-7df1-a730-1722c2538a02",
          status: "paid",
        }),
      );
    const gateway = createRazorpayPaymentGateway({ fetch: fetcher, keyId, keySecret });
    const input = {
      amountPaise: 49_900,
      currency: "INR" as const,
      receipt: "0199a72d-3f45-7df1-a730-1722c2538a02",
    };

    await expect(gateway.createOrder(input)).resolves.toEqual({
      amountPaise: 49_900,
      currency: "INR",
      id: "order_9A33XWu170gUtm",
      receipt: input.receipt,
      status: "created",
    });
    await expect(gateway.fetchOrder("order_9A33XWu170gUtm")).resolves.toEqual({
      amountPaise: 49_900,
      currency: "INR",
      id: "order_9A33XWu170gUtm",
      receipt: input.receipt,
      status: "paid",
    });
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://api.razorpay.com/v1/orders");
    const createOptions = fetcher.mock.calls[0]?.[1];
    expect(createOptions?.method).toBe("POST");
    expect(new Headers(createOptions?.headers).get("authorization")).toBe(
      `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
    );
    expect(JSON.parse(String(createOptions?.body))).toEqual({
      amount: 49_900,
      currency: "INR",
      partial_payment: false,
      receipt: input.receipt,
    });
  });

  it("returns only bounded payment facts needed for authoritative reconciliation", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        count: 2,
        entity: "collection",
        items: [
          {
            amount: 49_900,
            captured: true,
            contact: "+919999999999",
            currency: "INR",
            email: "private@example.invalid",
            entity: "payment",
            id: "pay_N8FVRD1DzYzBh1",
            order_id: "order_9A33XWu170gUtm",
            status: "captured",
          },
          {
            amount: 49_900,
            currency: "INR",
            entity: "payment",
            id: "pay_N8FUmetkCE2hZP",
            order_id: "order_9A33XWu170gUtm",
            status: "failed",
          },
        ],
      }),
    );
    const gateway = createRazorpayPaymentGateway({ fetch: fetcher, keyId, keySecret });

    await expect(gateway.fetchPaymentsForOrder("order_9A33XWu170gUtm")).resolves.toEqual([
      {
        amountPaise: 49_900,
        currency: "INR",
        id: "pay_N8FVRD1DzYzBh1",
        orderId: "order_9A33XWu170gUtm",
        status: "captured",
      },
      {
        amountPaise: 49_900,
        currency: "INR",
        id: "pay_N8FUmetkCE2hZP",
        orderId: "order_9A33XWu170gUtm",
        status: "failed",
      },
    ]);
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "https://api.razorpay.com/v1/orders/order_9A33XWu170gUtm/payments",
    );
  });

  it("recovers an order by its durable UUID receipt after an uncertain create response", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        count: 1,
        entity: "collection",
        items: [
          {
            amount: 49_900,
            currency: "INR",
            entity: "order",
            id: "order_9A33XWu170gUtm",
            receipt: "0199a72d-3f45-7df1-a730-1722c2538a02",
            status: "created",
          },
        ],
      }),
    );
    const gateway = createRazorpayPaymentGateway({ fetch: fetcher, keyId, keySecret });

    await expect(
      gateway.findOrderByReceipt("0199a72d-3f45-7df1-a730-1722c2538a02"),
    ).resolves.toMatchObject({ id: "order_9A33XWu170gUtm", amountPaise: 49_900 });
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "https://api.razorpay.com/v1/orders?receipt=0199a72d-3f45-7df1-a730-1722c2538a02",
    );
  });

  it("submits an approved refund with the durable receipt as provider idempotency", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        amount: 49_900,
        created_at: 1_788_476_400,
        currency: "INR",
        entity: "refund",
        id: "rfnd_FP8QHiV938haTz",
        payment_id: "pay_N8FVRD1DzYzBh1",
        receipt: "0199a72d-3f45-7df1-a730-1722c2538a09",
        status: "processed",
      }),
    );
    const gateway = createRazorpayPaymentGateway({ fetch: fetcher, keyId, keySecret });

    await expect(
      gateway.requestRefund({
        amountPaise: 49_900,
        currency: "INR",
        paymentId: "pay_N8FVRD1DzYzBh1",
        receipt: "0199a72d-3f45-7df1-a730-1722c2538a09",
      }),
    ).resolves.toEqual({
      amountPaise: 49_900,
      currency: "INR",
      id: "rfnd_FP8QHiV938haTz",
      paymentId: "pay_N8FVRD1DzYzBh1",
      receipt: "0199a72d-3f45-7df1-a730-1722c2538a09",
      status: "processed",
    });
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
      amount: 49_900,
      receipt: "0199a72d-3f45-7df1-a730-1722c2538a09",
      speed: "normal",
    });
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get("X-Refund-Idempotency")).toBe(
      "0199a72d-3f45-7df1-a730-1722c2538a09",
    );
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get("Authorization")).toBe(
      `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
    );
  });

  it.each([
    { amount: 1 },
    { currency: "USD" },
    { payment_id: "pay_WRONGpayment" },
    { receipt: "0199a72d-3f45-7df1-a730-1722c2538a10" },
    { id: ["rfnd_FP8QHiV938haTz"] },
    { status: ["processed"] },
  ])("rejects a refund response that does not confirm the exact request: %j", async (changed) => {
    const gateway = createRazorpayPaymentGateway({
      keyId,
      keySecret,
      fetch: vi.fn<typeof fetch>().mockResolvedValue(
        response({
          amount: 49_900,
          currency: "INR",
          id: "rfnd_FP8QHiV938haTz",
          payment_id: "pay_N8FVRD1DzYzBh1",
          receipt: "0199a72d-3f45-7df1-a730-1722c2538a09",
          status: "processed",
          ...changed,
        }),
      ),
    });
    await expect(
      gateway.requestRefund({
        amountPaise: 49_900,
        currency: "INR",
        paymentId: "pay_N8FVRD1DzYzBh1",
        receipt: "0199a72d-3f45-7df1-a730-1722c2538a09",
      }),
    ).rejects.toThrow("PROVIDER_INVALID_RESPONSE");
  });

  it("rejects live keys and malformed provider responses without reflecting credentials", async () => {
    expect(() =>
      createRazorpayPaymentGateway({
        fetch: vi.fn<typeof fetch>(),
        keyId: "rzp_live_not_authorized",
        keySecret,
      }),
    ).toThrow("RAZORPAY_TEST_MODE_REQUIRED");
    const gateway = createRazorpayPaymentGateway({
      fetch: vi.fn<typeof fetch>().mockResolvedValue(response({ id: "wrong" })),
      keyId,
      keySecret,
    });
    await expect(
      gateway.createOrder({ amountPaise: 49_900, currency: "INR", receipt: "report-safe" }),
    ).rejects.not.toThrow(keySecret);
  });

  it.each([true, false])(
    "cancels oversized provider responses before consuming the whole body (declared: %s)",
    async (declared) => {
      let cancelled = false;
      let chunks = 0;
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (chunks++ === 5) controller.close();
          else controller.enqueue(new Uint8Array(70_000));
        },
        cancel() {
          cancelled = true;
        },
      });
      const gateway = createRazorpayPaymentGateway({
        keyId,
        keySecret,
        fetch: vi.fn<typeof fetch>().mockResolvedValue(
          new Response(stream, {
            headers: declared ? { "Content-Length": "350000" } : {},
          }),
        ),
      });
      await expect(gateway.fetchOrder("order_9A33XWu170gUtm")).rejects.toThrow(
        "PROVIDER_INVALID_RESPONSE",
      );
      expect(cancelled).toBe(true);
    },
  );

  it("normalizes response-body failures without exposing provider diagnostics", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error(`private provider diagnostic ${keySecret}`));
      },
    });
    const gateway = createRazorpayPaymentGateway({
      keyId,
      keySecret,
      fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response(stream)),
    });
    await expect(gateway.fetchOrder("order_9A33XWu170gUtm")).rejects.toThrow(
      "PROVIDER_UNAVAILABLE",
    );
  });

  it("fetches the exact persisted refund for asynchronous completion", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        id: "rfnd_FP8QHiV938haTz",
        amount: 49_900,
        currency: "INR",
        payment_id: "pay_N8FVRD1DzYzBh1",
        receipt: "0199a72d-3f45-7df1-a730-1722c2538a09",
        status: "processed",
      }),
    );
    const gateway = createRazorpayPaymentGateway({ fetch: fetcher, keyId, keySecret });
    await expect(gateway.fetchRefund("rfnd_FP8QHiV938haTz")).resolves.toMatchObject({
      id: "rfnd_FP8QHiV938haTz",
      status: "processed",
      amountPaise: 49_900,
    });
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(
      "https://api.razorpay.com/v1/refunds/rfnd_FP8QHiV938haTz",
    );
  });
});
