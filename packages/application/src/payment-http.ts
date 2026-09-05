import { createHash, timingSafeEqual } from "node:crypto";
import type { Clock } from "./clock";
import {
  type PaymentModule,
  type PaymentOrderRecord,
  PaymentProviderMismatchError,
  type PaymentRefundRequest,
  PaymentSignatureError,
} from "./payment";
import { createSessionAuthentication, type SessionRepository } from "./session-authentication";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const PROVIDER_ORDER = /^order_[A-Za-z0-9_-]{1,80}$/u;
const PROVIDER_PAYMENT = /^pay_[A-Za-z0-9_-]{1,80}$/u;
const SIGNATURE = /^[0-9a-f]{64}$/iu;

export interface PaymentHttpHandlers {
  checkout(request: Request, intentId: string): Promise<Response>;
  proof(request: Request, orderId: string): Promise<Response>;
  status(request: Request, orderId: string): Promise<Response>;
  webhook(request: Request): Promise<Response>;
  reconcile(request: Request): Promise<Response>;
  requestRefund(request: Request, orderId: string): Promise<Response>;
  administerRefund(request: Request): Promise<Response>;
}

function reply(status: number, body: unknown): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}
function failure(status: number, code: string): Response {
  return reply(status, { error: { code } });
}
function customerOrder(order: PaymentOrderRecord) {
  return {
    id: order.id,
    amountPaise: order.amountPaise,
    currency: order.currency,
    status: order.status,
    ...(order.reportId === undefined ? {} : { reportId: order.reportId }),
  };
}

/** Read the original bounded byte stream, before JSON parsing or HMAC verification. */
async function bodyBytes(request: Request, maximum: number): Promise<Uint8Array> {
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/u.test(declared) || Number(declared) > maximum))
    throw new RangeError("PAYMENT_BODY_TOO_LARGE");
  if (request.body === null) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > maximum) {
        await reader.cancel();
        throw new RangeError("PAYMENT_BODY_TOO_LARGE");
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, size);
}
async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  if (
    request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json"
  )
    throw new RangeError("PAYMENT_INPUT_INVALID");
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(await bodyBytes(request, 8_192)).toString("utf8"));
  } catch (error) {
    if (error instanceof RangeError) throw error;
    throw new RangeError("PAYMENT_INPUT_INVALID");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
    throw new RangeError("PAYMENT_INPUT_INVALID");
  return parsed as Record<string, unknown>;
}
function onlyKeys(body: Record<string, unknown>, keys: readonly string[]): void {
  if (Object.keys(body).some((key) => !keys.includes(key)))
    throw new RangeError("PAYMENT_INPUT_INVALID");
}
function errorReply(error: unknown): Response {
  if (error instanceof PaymentSignatureError) return failure(400, error.code);
  if (error instanceof PaymentProviderMismatchError) return failure(409, error.code);
  const code = error instanceof Error ? error.message : "";
  if (code === "PAYMENT_BODY_TOO_LARGE") return failure(413, code);
  if (
    code === "PAYMENT_CHECKOUT_NOT_AVAILABLE" ||
    code === "PAYMENT_ORDER_NOT_FOUND" ||
    code === "PAYMENT_PROVIDER_ORDER_NOT_FOUND"
  )
    return failure(404, "PAYMENT_NOT_FOUND");
  if (
    [
      "PAYMENT_EVENT_CONFLICT",
      "PAYMENT_PROVIDER_MISMATCH",
      "PAYMENT_PROVIDER_ORDER_CONFLICT",
      "PAYMENT_ORDER_CONFLICT",
      "PAYMENT_ID_CONFLICT",
    ].includes(code)
  )
    return failure(409, code);
  if (error instanceof RangeError || code.startsWith("PAYMENT_WEBHOOK_INVALID"))
    return failure(400, "PAYMENT_INPUT_INVALID");
  return failure(503, "PAYMENT_TEMPORARILY_UNAVAILABLE");
}

/** Session identity never comes from a request field. Operator routes use a separate bearer boundary. */
export function createPaymentHttpHandlers(dependencies: {
  readonly module: PaymentModule;
  readonly clock: Clock;
  readonly origin: string;
  readonly sessions: SessionRepository;
  readonly keyId: string;
  readonly checkoutName: string;
  readonly checkoutDescription?: string;
  readonly internalSecret: string;
  readonly requestBudget: { consume(request: Request, identity: string): Promise<boolean> };
}): PaymentHttpHandlers {
  if (
    !/^rzp_test_[A-Za-z0-9]{8,80}$/u.test(dependencies.keyId) ||
    dependencies.internalSecret.length < 32 ||
    dependencies.internalSecret.length > 256
  )
    throw new RangeError("PAYMENT_CONFIGURATION_INVALID");
  const auth = createSessionAuthentication(dependencies);
  const internalDigest = createHash("sha256")
    .update(`Bearer ${dependencies.internalSecret}`)
    .digest();
  async function customer(request: Request, write: boolean): Promise<string | Response> {
    const context = await auth.read(request);
    if (context.session === null) return failure(401, "AUTHENTICATION_REQUIRED");
    if (write && !context.csrfValid) return failure(403, "CSRF_INVALID");
    if (write && !UUID.test(request.headers.get("idempotency-key") ?? ""))
      return failure(400, "IDEMPOTENCY_KEY_REQUIRED");
    if (!(await dependencies.requestBudget.consume(request, context.session.principalId)))
      return failure(429, "RATE_LIMITED");
    return context.session.principalId;
  }
  async function operator(request: Request): Promise<Response | null> {
    const value = request.headers.get("authorization") ?? "";
    if (
      value.length > 300 ||
      !timingSafeEqual(internalDigest, createHash("sha256").update(value).digest())
    )
      return failure(404, "NOT_FOUND");
    if (!(await dependencies.requestBudget.consume(request, "payment-operator")))
      return failure(429, "RATE_LIMITED");
    return null;
  }
  const guarded =
    <Args extends unknown[]>(
      method: "GET" | "POST",
      action: (request: Request, ...args: Args) => Promise<Response>,
    ) =>
    async (request: Request, ...args: Args): Promise<Response> => {
      if (request.method !== method) return failure(405, "METHOD_NOT_ALLOWED");
      try {
        return await action(request, ...args);
      } catch (error) {
        return errorReply(error);
      }
    };
  return {
    checkout: guarded("POST", async (request, intentId: string) => {
      const principalId = await customer(request, true);
      if (principalId instanceof Response) return principalId;
      if (!UUID.test(intentId)) return failure(404, "PAYMENT_NOT_FOUND");
      onlyKeys(await jsonBody(request), []);
      const result = await dependencies.module.createCheckout({
        now: dependencies.clock.now(),
        ownerPrincipalId: principalId,
        reportIntentId: intentId,
      });
      const checkout =
        result.checkout === null
          ? null
          : {
              keyId: dependencies.keyId,
              providerOrderId: result.checkout.providerOrderId,
              name: dependencies.checkoutName,
              description: dependencies.checkoutDescription ?? "Personal numerology report",
            };
      return reply(result.order.status === "ambiguous" ? 202 : 201, {
        order: customerOrder(result.order),
        checkout,
      });
    }),
    status: guarded("GET", async (request, orderId: string) => {
      const principalId = await customer(request, false);
      if (principalId instanceof Response) return principalId;
      const order = await dependencies.module.getOrderStatus({
        orderId,
        ownerPrincipalId: principalId,
      });
      return order === null
        ? failure(404, "PAYMENT_NOT_FOUND")
        : reply(200, { order: customerOrder(order) });
    }),
    proof: guarded("POST", async (request, orderId: string) => {
      const principalId = await customer(request, true);
      if (principalId instanceof Response) return principalId;
      const order = await dependencies.module.getOrderStatus({
        orderId,
        ownerPrincipalId: principalId,
      });
      if (order === null) return failure(404, "PAYMENT_NOT_FOUND");
      const body = await jsonBody(request);
      onlyKeys(body, ["providerOrderId", "paymentId", "signature"]);
      if (
        typeof body.providerOrderId !== "string" ||
        !PROVIDER_ORDER.test(body.providerOrderId) ||
        typeof body.paymentId !== "string" ||
        !PROVIDER_PAYMENT.test(body.paymentId) ||
        typeof body.signature !== "string" ||
        !SIGNATURE.test(body.signature)
      )
        return failure(400, "PAYMENT_INPUT_INVALID");
      try {
        const result = await dependencies.module.proveCheckout({
          now: dependencies.clock.now(),
          orderId,
          providerOrderId: body.providerOrderId,
          paymentId: body.paymentId,
          signature: body.signature,
        });
        return reply(200, { order: customerOrder(result.order) });
      } catch (error) {
        const response = errorReply(error);
        if (response.status !== 503) return response;
        const current = await dependencies.module.getOrderStatus({
          orderId,
          ownerPrincipalId: principalId,
        });
        return current === null ? response : reply(202, { order: customerOrder(current) });
      }
    }),
    webhook: guarded("POST", async (request) => {
      const eventId = request.headers.get("x-razorpay-event-id") ?? "";
      const signature = request.headers.get("x-razorpay-signature") ?? "";
      if (!/^[A-Za-z0-9_-]{1,100}$/u.test(eventId) || !SIGNATURE.test(signature))
        return failure(400, "PAYMENT_INPUT_INVALID");
      await dependencies.module.processWebhook({
        eventId: `webhook:${eventId}`,
        signature,
        rawBody: await bodyBytes(request, 65_536),
      });
      return reply(200, { received: true });
    }),
    reconcile: guarded("POST", async (request) => {
      const denied = await operator(request);
      if (denied !== null) return denied;
      const body = await jsonBody(request);
      onlyKeys(body, ["orderId"]);
      if (typeof body.orderId !== "string" || !UUID.test(body.orderId))
        return failure(400, "PAYMENT_INPUT_INVALID");
      const result = await dependencies.module.reconcile({
        orderId: body.orderId,
        now: dependencies.clock.now(),
      });
      return reply(200, { order: customerOrder(result.order) });
    }),
    requestRefund: guarded("POST", async (request, orderId: string) => {
      const principalId = await customer(request, true);
      if (principalId instanceof Response) return principalId;
      onlyKeys(await jsonBody(request), []);
      const refund = await dependencies.module.requestRefund({
        orderId,
        principalId,
        now: dependencies.clock.now(),
        idempotencyKey: request.headers.get("idempotency-key") ?? "",
      });
      return refund === null
        ? failure(404, "PAYMENT_NOT_FOUND")
        : reply(200, { refund: { id: refund.id, status: refund.status } });
    }),
    administerRefund: guarded("POST", async (request) => {
      const denied = await operator(request);
      if (denied !== null) return denied;
      const body = await jsonBody(request);
      onlyKeys(body, ["refundRequestId", "action", "approverId"]);
      if (typeof body.refundRequestId !== "string" || !UUID.test(body.refundRequestId))
        return failure(400, "PAYMENT_INPUT_INVALID");
      let refund: PaymentRefundRequest | null;
      if (
        body.action === "approve" &&
        typeof body.approverId === "string" &&
        UUID.test(body.approverId)
      ) {
        refund = await dependencies.module.approveRefund({
          refundRequestId: body.refundRequestId,
          approverId: body.approverId,
          now: dependencies.clock.now(),
        });
      } else if (body.action === "execute" && body.approverId === undefined) {
        refund = await dependencies.module.executeApprovedRefund({
          refundRequestId: body.refundRequestId,
          now: dependencies.clock.now(),
        });
      } else return failure(400, "PAYMENT_INPUT_INVALID");
      return refund === null
        ? failure(404, "PAYMENT_NOT_FOUND")
        : reply(200, { refund: { id: refund.id, status: refund.status } });
    }),
  };
}
