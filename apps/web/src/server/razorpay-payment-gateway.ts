const API_ROOT = "https://api.razorpay.com/v1";
const MAX_RESPONSE_BYTES = 128 * 1024;
const ORDER_ID = /^order_[A-Za-z0-9]{6,64}$/u;
const PAYMENT_ID = /^pay_[A-Za-z0-9]{6,64}$/u;
const REFUND_ID = /^rfnd_[A-Za-z0-9]{6,64}$/u;
const RECEIPT = /^[A-Za-z0-9._:-]{1,40}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ORDER_STATUSES = new Set(["created", "attempted", "paid"]);
const PAYMENT_STATUSES = new Set(["created", "authorized", "captured", "refunded", "failed"]);
const REFUND_STATUSES = new Set(["pending", "processed", "failed"]);

interface ProviderOrder {
  readonly amountPaise: number;
  readonly currency: "INR";
  readonly id: string;
  readonly receipt: string;
  readonly status: "created" | "attempted" | "paid";
}

interface ProviderPayment {
  readonly amountPaise: number;
  readonly currency: "INR";
  readonly id: string;
  readonly orderId: string;
  readonly status: "created" | "authorized" | "captured" | "refunded" | "failed";
}

interface ProviderRefund {
  readonly amountPaise: number;
  readonly currency: "INR";
  readonly id: string;
  readonly paymentId: string;
  readonly receipt: string;
  readonly status: "pending" | "processed" | "failed";
}

export class RazorpayGatewayError extends Error {
  public constructor(
    readonly code: "PROVIDER_INVALID_RESPONSE" | "PROVIDER_REJECTED" | "PROVIDER_UNAVAILABLE",
  ) {
    super(code);
    this.name = "RazorpayGatewayError";
  }
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new RazorpayGatewayError("PROVIDER_INVALID_RESPONSE");
  return value as Record<string, unknown>;
}

function integer(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0)
    throw new RazorpayGatewayError("PROVIDER_INVALID_RESPONSE");
  return Number(value);
}

function hasControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code < 0x20 || code === 0x7f;
  });
}

function providerOrder(value: unknown): ProviderOrder {
  const item = record(value);
  if (
    !ORDER_ID.test(String(item.id)) ||
    item.currency !== "INR" ||
    !RECEIPT.test(String(item.receipt)) ||
    !ORDER_STATUSES.has(String(item.status))
  ) {
    throw new RazorpayGatewayError("PROVIDER_INVALID_RESPONSE");
  }
  return {
    amountPaise: integer(item.amount),
    currency: "INR",
    id: String(item.id),
    receipt: String(item.receipt),
    status: item.status as ProviderOrder["status"],
  };
}

function providerPayment(value: unknown): ProviderPayment {
  const item = record(value);
  if (
    !PAYMENT_ID.test(String(item.id)) ||
    !ORDER_ID.test(String(item.order_id)) ||
    item.currency !== "INR" ||
    !PAYMENT_STATUSES.has(String(item.status))
  ) {
    throw new RazorpayGatewayError("PROVIDER_INVALID_RESPONSE");
  }
  return {
    amountPaise: integer(item.amount),
    currency: "INR",
    id: String(item.id),
    orderId: String(item.order_id),
    status: item.status as ProviderPayment["status"],
  };
}

async function safeJson(response: Response): Promise<unknown> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    void response.body?.cancel().catch(() => undefined);
    throw new RazorpayGatewayError("PROVIDER_INVALID_RESPONSE");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new RazorpayGatewayError("PROVIDER_INVALID_RESPONSE");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > MAX_RESPONSE_BYTES) {
        void reader.cancel().catch(() => undefined);
        throw new RazorpayGatewayError("PROVIDER_INVALID_RESPONSE");
      }
      chunks.push(chunk.value);
    }
  } catch (cause) {
    if (cause instanceof RazorpayGatewayError) throw cause;
    throw new RazorpayGatewayError("PROVIDER_UNAVAILABLE");
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks, length).toString("utf8"));
  } catch {
    throw new RazorpayGatewayError("PROVIDER_INVALID_RESPONSE");
  }
}

/** Test-mode Razorpay HTTP adapter. Business validation remains in the payment module. */
export function createRazorpayPaymentGateway(options: {
  readonly fetch: typeof fetch;
  readonly keyId: string;
  readonly keySecret: string;
  readonly timeoutMs?: number;
}) {
  if (!/^rzp_test_[A-Za-z0-9]{8,64}$/u.test(options.keyId))
    throw new RangeError("RAZORPAY_TEST_MODE_REQUIRED");
  if (
    options.keySecret.length < 16 ||
    options.keySecret.length > 256 ||
    hasControlCharacter(options.keySecret)
  ) {
    throw new RangeError("RAZORPAY_KEY_SECRET_INVALID");
  }
  const timeoutMs = options.timeoutMs ?? 5_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 250 || timeoutMs > 15_000)
    throw new RangeError("RAZORPAY_TIMEOUT_INVALID");
  const authorization = `Basic ${Buffer.from(`${options.keyId}:${options.keySecret}`).toString("base64")}`;

  async function request(path: string, init?: RequestInit): Promise<unknown> {
    let response: Response;
    const headers = new Headers(init?.headers);
    headers.set("Accept", "application/json");
    headers.set("Authorization", authorization);
    if (init?.body !== undefined) headers.set("Content-Type", "application/json");
    try {
      response = await options.fetch(`${API_ROOT}${path}`, {
        ...init,
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new RazorpayGatewayError("PROVIDER_UNAVAILABLE");
    }
    if (!response.ok) {
      // Provider bodies can contain customer or credential diagnostics; never reflect them.
      await response.body?.cancel().catch(() => undefined);
      throw new RazorpayGatewayError(
        response.status >= 500 ? "PROVIDER_UNAVAILABLE" : "PROVIDER_REJECTED",
      );
    }
    return safeJson(response);
  }

  return {
    async createOrder(input: {
      readonly amountPaise: number;
      readonly currency: "INR";
      readonly receipt: string;
    }): Promise<ProviderOrder> {
      if (
        !Number.isSafeInteger(input.amountPaise) ||
        input.amountPaise < 1 ||
        input.currency !== "INR" ||
        !RECEIPT.test(input.receipt)
      ) {
        throw new RangeError("RAZORPAY_ORDER_INPUT_INVALID");
      }
      return providerOrder(
        await request("/orders", {
          body: JSON.stringify({
            amount: input.amountPaise,
            currency: input.currency,
            partial_payment: false,
            receipt: input.receipt,
          }),
          method: "POST",
        }),
      );
    },

    async fetchOrder(providerOrderId: string): Promise<ProviderOrder> {
      if (!ORDER_ID.test(providerOrderId)) throw new RangeError("RAZORPAY_ORDER_ID_INVALID");
      return providerOrder(await request(`/orders/${encodeURIComponent(providerOrderId)}`));
    },

    async fetchPaymentsForOrder(providerOrderId: string): Promise<readonly ProviderPayment[]> {
      if (!ORDER_ID.test(providerOrderId)) throw new RangeError("RAZORPAY_ORDER_ID_INVALID");
      const collection = record(
        await request(`/orders/${encodeURIComponent(providerOrderId)}/payments`),
      );
      if (
        collection.entity !== "collection" ||
        !Array.isArray(collection.items) ||
        collection.items.length > 100 ||
        integer(collection.count) !== collection.items.length
      ) {
        throw new RazorpayGatewayError("PROVIDER_INVALID_RESPONSE");
      }
      return collection.items.map(providerPayment);
    },

    async findOrderByReceipt(receipt: string): Promise<ProviderOrder | null> {
      if (!UUID.test(receipt)) throw new RangeError("RAZORPAY_RECEIPT_INVALID");
      const collection = record(await request(`/orders?receipt=${encodeURIComponent(receipt)}`));
      if (
        collection.entity !== "collection" ||
        !Array.isArray(collection.items) ||
        collection.items.length > 1 ||
        integer(collection.count) !== collection.items.length
      ) {
        throw new RazorpayGatewayError("PROVIDER_INVALID_RESPONSE");
      }
      const item = collection.items[0];
      if (item === undefined) return null;
      const order = providerOrder(item);
      if (order.receipt !== receipt) throw new RazorpayGatewayError("PROVIDER_INVALID_RESPONSE");
      return order;
    },

    async fetchRefund(providerRefundId: string): Promise<ProviderRefund> {
      if (!REFUND_ID.test(providerRefundId)) throw new RangeError("RAZORPAY_REFUND_INPUT_INVALID");
      const refund = record(
        await request(`/refunds/${encodeURIComponent(providerRefundId)}`, { method: "GET" }),
      );
      if (
        refund.id !== providerRefundId ||
        typeof refund.status !== "string" ||
        !REFUND_STATUSES.has(refund.status) ||
        refund.currency !== "INR" ||
        typeof refund.payment_id !== "string" ||
        !PAYMENT_ID.test(refund.payment_id) ||
        typeof refund.receipt !== "string" ||
        !UUID.test(refund.receipt)
      )
        throw new RazorpayGatewayError("PROVIDER_INVALID_RESPONSE");
      return {
        id: providerRefundId,
        amountPaise: integer(refund.amount),
        currency: "INR",
        paymentId: refund.payment_id,
        receipt: refund.receipt,
        status: refund.status as ProviderRefund["status"],
      };
    },
    async requestRefund(input: {
      readonly amountPaise: number;
      readonly currency: "INR";
      readonly paymentId: string;
      readonly receipt: string;
    }): Promise<ProviderRefund> {
      if (
        !Number.isSafeInteger(input.amountPaise) ||
        input.amountPaise < 1 ||
        input.currency !== "INR" ||
        !PAYMENT_ID.test(input.paymentId) ||
        !UUID.test(input.receipt)
      ) {
        throw new RangeError("RAZORPAY_REFUND_INPUT_INVALID");
      }
      const refund = record(
        await request(`/payments/${encodeURIComponent(input.paymentId)}/refund`, {
          headers: { "X-Refund-Idempotency": input.receipt },
          body: JSON.stringify({
            amount: input.amountPaise,
            receipt: input.receipt,
            speed: "normal",
          }),
          method: "POST",
        }),
      );
      if (
        typeof refund.id !== "string" ||
        !REFUND_ID.test(refund.id) ||
        typeof refund.status !== "string" ||
        !REFUND_STATUSES.has(refund.status) ||
        refund.amount !== input.amountPaise ||
        refund.currency !== input.currency ||
        refund.payment_id !== input.paymentId ||
        refund.receipt !== input.receipt
      )
        throw new RazorpayGatewayError("PROVIDER_INVALID_RESPONSE");
      return {
        amountPaise: input.amountPaise,
        currency: input.currency,
        id: refund.id,
        paymentId: input.paymentId,
        receipt: input.receipt,
        status: refund.status as ProviderRefund["status"],
      };
    },
  };
}
