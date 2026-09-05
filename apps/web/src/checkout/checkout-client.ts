import { readIntakeCsrf } from "../intake/intake-client";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const PROVIDER_ORDER = /^order_[A-Za-z0-9_]{6,64}$/u;
const PROVIDER_PAYMENT = /^pay_[A-Za-z0-9_]{6,64}$/u;
const SIGNATURE = /^[0-9a-f]{64}$/u;
const CSRF = /^[A-Za-z0-9_-]{43}$/u;
const ORDER_STATUSES = new Set(["pending", "ambiguous", "paid", "failed", "expired", "refunded"]);

export type CustomerOrderStatus =
  | "pending"
  | "ambiguous"
  | "paid"
  | "failed"
  | "expired"
  | "refunded";

export interface CustomerOrder {
  readonly amountPaise: 49_900;
  readonly currency: "INR";
  readonly id: string;
  readonly reportId?: string;
  readonly status: CustomerOrderStatus;
}

export interface CheckoutSession {
  readonly checkout: {
    readonly description: string;
    readonly keyId: string;
    readonly name: string;
    readonly providerOrderId: string;
  } | null;
  readonly order: CustomerOrder;
}

export interface CheckoutProof {
  readonly paymentId: string;
  readonly providerOrderId: string;
  readonly signature: string;
}

export class CheckoutRequestError extends Error {
  public constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(
      status === 401
        ? "Your secure session has expired. Sign in again before paying."
        : status === 404
          ? "Checkout is not available for this report request."
          : status === 409
            ? "This checkout changed in another tab. Check its payment status."
            : "Secure checkout is not available right now. Please try again.",
    );
  }
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error("CHECKOUT_RESPONSE_INVALID");
  return value as Record<string, unknown>;
}

function exact(value: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    throw new Error("CHECKOUT_RESPONSE_INVALID");
}

function bounded(value: unknown, maximum: number): string {
  if (typeof value !== "string" || value.trim().length < 1 || value.length > maximum)
    throw new Error("CHECKOUT_RESPONSE_INVALID");
  return value;
}

function parseOrder(value: unknown): CustomerOrder {
  const order = record(value);
  exact(order, ["amountPaise", "currency", "id", "reportId", "status"]);
  if (
    order.amountPaise !== 49_900 ||
    order.currency !== "INR" ||
    !UUID.test(String(order.id)) ||
    !ORDER_STATUSES.has(String(order.status)) ||
    (order.reportId !== undefined && !UUID.test(String(order.reportId)))
  ) {
    throw new Error("CHECKOUT_RESPONSE_INVALID");
  }
  return {
    amountPaise: 49_900,
    currency: "INR",
    id: String(order.id).toLowerCase(),
    status: order.status as CustomerOrderStatus,
    ...(order.reportId === undefined ? {} : { reportId: String(order.reportId).toLowerCase() }),
  };
}

function parseCheckout(value: unknown): CheckoutSession {
  const body = record(value);
  exact(body, ["checkout", "order"]);
  const order = parseOrder(body.order);
  if (body.checkout === null) return { checkout: null, order };
  const checkout = record(body.checkout);
  exact(checkout, ["description", "keyId", "name", "providerOrderId"]);
  const providerOrderId = bounded(checkout.providerOrderId, 70);
  const keyId = bounded(checkout.keyId, 100);
  if (!PROVIDER_ORDER.test(providerOrderId) || !/^rzp_test_[A-Za-z0-9_]+$/u.test(keyId))
    throw new Error("CHECKOUT_RESPONSE_INVALID");
  return {
    checkout: {
      description: bounded(checkout.description, 255),
      keyId,
      name: bounded(checkout.name, 120),
      providerOrderId,
    },
    order,
  };
}

function parseStatus(value: unknown): CustomerOrder {
  const body = record(value);
  exact(body, ["order"]);
  return parseOrder(body.order);
}

/** Strict customer client: neither browser callbacks nor response extras are payment authority. */
export function createCheckoutClient(
  dependencies: {
    readonly csrf: () => string;
    readonly fetch: typeof fetch;
    readonly key: () => string;
  } = {
    csrf: readIntakeCsrf,
    fetch: (...arguments_) => fetch(...arguments_),
    key: () => crypto.randomUUID(),
  },
) {
  const checkoutKeys = new Map<string, string>();
  const proofKeys = new Map<string, string>();

  async function request(path: string, method: "GET" | "POST", body?: unknown, key?: string) {
    const csrf = dependencies.csrf();
    if (method !== "GET" && !CSRF.test(csrf))
      throw new CheckoutRequestError(401, "UNAUTHENTICATED");
    const response = await dependencies.fetch(path, {
      cache: "no-store",
      credentials: "same-origin",
      method,
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(method === "GET" ? {} : { "X-CSRF-Token": csrf }),
        ...(key === undefined ? {} : { "Idempotency-Key": key }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const value: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const code =
        value && typeof value === "object" && "code" in value && typeof value.code === "string"
          ? value.code
          : "CHECKOUT_UNAVAILABLE";
      throw new CheckoutRequestError(response.status, code);
    }
    return value;
  }

  return {
    async create(intentId: string): Promise<CheckoutSession> {
      if (!UUID.test(intentId)) throw new CheckoutRequestError(404, "REPORT_INTENT_NOT_FOUND");
      const key = checkoutKeys.get(intentId) ?? dependencies.key();
      checkoutKeys.set(intentId, key);
      return parseCheckout(
        await request(`/api/v1/report-intents/${intentId}/checkout`, "POST", {}, key),
      );
    },
    async prove(orderId: string, proof: CheckoutProof): Promise<CustomerOrder> {
      if (
        !UUID.test(orderId) ||
        !PROVIDER_ORDER.test(proof.providerOrderId) ||
        !PROVIDER_PAYMENT.test(proof.paymentId) ||
        !SIGNATURE.test(proof.signature)
      ) {
        throw new CheckoutRequestError(400, "CHECKOUT_PROOF_INVALID");
      }
      const key = proofKeys.get(orderId) ?? dependencies.key();
      proofKeys.set(orderId, key);
      return parseStatus(await request(`/api/v1/orders/${orderId}/proof`, "POST", proof, key));
    },
    async status(orderId: string): Promise<CustomerOrder> {
      if (!UUID.test(orderId)) throw new CheckoutRequestError(404, "ORDER_NOT_FOUND");
      return parseStatus(await request(`/api/v1/orders/${orderId}`, "GET"));
    },
  };
}
