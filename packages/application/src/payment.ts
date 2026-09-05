import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { type IdGenerator, randomIdGenerator } from "./id-generator";

export const PAYMENT_PRODUCT_VERSION = "personal-numerology-report-v1" as const;
export const PAYMENT_AMOUNT_PAISE = 49_900 as const;
export const PAYMENT_CURRENCY = "INR" as const;
export const PAYMENT_OUTBOX_EVENT = "report.generation.requested.v1" as const;

export type PaymentOrderStatus =
  | "pending"
  | "ambiguous"
  | "paid"
  | "failed"
  | "expired"
  | "refunded";
export type ProviderPaymentStatus = "created" | "authorized" | "captured" | "failed" | "refunded";
export type PaymentEventType = "payment.authorized" | "payment.captured" | "payment.failed";

export interface ProviderOrder {
  readonly amountPaise: number;
  readonly currency: string;
  readonly id: string;
  readonly receipt: string;
  readonly status: string;
}

export interface ProviderPayment {
  readonly amountPaise: number;
  readonly currency: string;
  readonly id: string;
  readonly orderId: string;
  readonly receipt?: string;
  readonly status: ProviderPaymentStatus;
}

export interface ProviderRefund {
  readonly amountPaise: number;
  readonly currency: string;
  readonly id: string;
  readonly paymentId: string;
  readonly receipt: string;
  readonly status: string;
}

export interface PaymentGateway {
  createOrder(input: {
    readonly amountPaise: typeof PAYMENT_AMOUNT_PAISE;
    readonly currency: typeof PAYMENT_CURRENCY;
    readonly receipt: string;
  }): Promise<ProviderOrder>;
  fetchOrder(providerOrderId: string): Promise<ProviderOrder>;
  fetchPaymentsForOrder(providerOrderId: string): Promise<readonly ProviderPayment[]>;
  fetchRefund(providerRefundId: string): Promise<ProviderRefund>;
  /** Lookup by the deterministic bare local order UUID after a create timeout. */
  findOrderByReceipt?(receipt: string): Promise<ProviderOrder | null>;
  requestRefund(input: {
    readonly amountPaise: typeof PAYMENT_AMOUNT_PAISE;
    readonly currency: typeof PAYMENT_CURRENCY;
    readonly paymentId: string;
    readonly receipt: string;
  }): Promise<ProviderRefund>;
}

export interface PaymentOrderRecord {
  readonly amountPaise: number;
  readonly currency: string;
  readonly id: string;
  readonly ownerPrincipalId: string;
  readonly productVersion: string;
  readonly providerOrderId?: string;
  readonly receipt: string;
  readonly reportId?: string;
  readonly reportIntentId: string;
  readonly status: PaymentOrderStatus;
}

export interface PaymentRecord {
  readonly amountPaise: number;
  readonly currency: string;
  readonly id: string;
  readonly orderId: string;
  readonly providerOrderId: string;
  readonly providerPaymentId: string;
  readonly receipt?: string;
  readonly status: ProviderPaymentStatus | "refunded";
}

export interface PrepareCheckoutInput {
  readonly amountPaise: typeof PAYMENT_AMOUNT_PAISE;
  readonly currency: typeof PAYMENT_CURRENCY;
  readonly now: Date;
  readonly orderId: string;
  readonly ownerPrincipalId: string;
  readonly productVersion: typeof PAYMENT_PRODUCT_VERSION;
  readonly reportIntentId: string;
  readonly receipt: string;
}

export interface AdoptProviderOrderInput {
  readonly now: Date;
  readonly amountPaise: typeof PAYMENT_AMOUNT_PAISE;
  readonly currency: typeof PAYMENT_CURRENCY;
  readonly orderId: string;
  readonly providerOrderId: string;
  readonly receipt: string;
}

export interface ProviderEventInput {
  readonly amountPaise: number;
  readonly currency: string;
  readonly eventId: string;
  readonly eventType: PaymentEventType;
  readonly occurredAt: Date;
  readonly payloadJson: Record<string, unknown>;
  readonly payment: ProviderPayment;
  readonly providerOrderId: string;
  readonly rawBodyHash: string;
  readonly receipt?: string;
  readonly source: "webhook" | "checkout_proof" | "reconciliation";
}

export interface PaymentSettlement {
  readonly deduplicated: boolean;
  readonly fulfilled: boolean;
  readonly order: PaymentOrderRecord;
  readonly payment: PaymentRecord;
}

export interface PaymentRefundRequest {
  readonly amountPaise: typeof PAYMENT_AMOUNT_PAISE;
  readonly currency: typeof PAYMENT_CURRENCY;
  readonly createdAt: Date;
  readonly id: string;
  readonly idempotencyKey: string;
  readonly orderId: string;
  readonly principalId: string;
  readonly providerPaymentId: string;
  readonly providerRefundId?: string;
  readonly status: "requested" | "approved" | "submitted" | "refunded" | "failed";
}

export interface PaymentRepository {
  confirmFailedOrder(input: {
    readonly now: Date;
    readonly orderId: string;
    readonly providerOrderId: string;
  }): Promise<PaymentOrderRecord>;
  confirmUnattemptedOrder(input: {
    readonly now: Date;
    readonly orderId: string;
    readonly providerOrderId: string;
  }): Promise<{ readonly confirmed: boolean; readonly order: PaymentOrderRecord }>;
  findFulfilment(orderId: string): Promise<{
    readonly reportId: string;
    readonly entitlementId: string;
    readonly outboxEventId: string;
  } | null>;
  adoptProviderOrder(input: AdoptProviderOrderInput): Promise<PaymentOrderRecord>;
  findOrderForOwner(orderId: string, ownerPrincipalId: string): Promise<PaymentOrderRecord | null>;
  findOrder(orderId: string): Promise<PaymentOrderRecord | null>;
  findRefundRequest(refundRequestId: string): Promise<PaymentRefundRequest | null>;
  markOrderAmbiguous(input: {
    readonly now: Date;
    readonly orderId: string;
  }): Promise<PaymentOrderRecord>;
  prepareCheckout(input: PrepareCheckoutInput): Promise<PaymentOrderRecord>;
  recordProviderEvent(input: ProviderEventInput): Promise<PaymentSettlement>;
  requestRefund(input: {
    readonly amountPaise: typeof PAYMENT_AMOUNT_PAISE;
    readonly currency: typeof PAYMENT_CURRENCY;
    readonly id: string;
    readonly idempotencyKey: string;
    readonly now: Date;
    readonly orderId: string;
    readonly principalId: string;
  }): Promise<PaymentRefundRequest | null>;
  approveRefund(input: {
    readonly now: Date;
    readonly refundRequestId: string;
    readonly approverId: string;
  }): Promise<PaymentRefundRequest | null>;
  recordRefundResult(input: {
    readonly now: Date;
    readonly providerRefundId: string;
    readonly refundRequestId: string;
    readonly status: "submitted" | "refunded" | "failed";
  }): Promise<PaymentRefundRequest | null>;
}

export interface PaymentModule {
  createCheckout(input: {
    readonly now: Date;
    readonly ownerPrincipalId: string;
    readonly reportIntentId: string;
  }): Promise<{
    readonly checkout: { readonly providerOrderId: string; readonly receipt: string } | null;
    readonly order: PaymentOrderRecord;
  }>;
  getOrderStatus(input: {
    readonly orderId: string;
    readonly ownerPrincipalId: string;
  }): Promise<PaymentOrderRecord | null>;
  processWebhook(input: {
    readonly eventId: string;
    readonly rawBody: Uint8Array | string;
    readonly signature: string;
  }): Promise<PaymentSettlement>;
  proveCheckout(input: {
    readonly now: Date;
    readonly orderId: string;
    readonly paymentId: string;
    readonly providerOrderId: string;
    readonly signature: string;
  }): Promise<PaymentSettlement>;
  reconcile(input: {
    readonly now: Date;
    readonly orderId: string;
  }): Promise<{ readonly order: PaymentOrderRecord }>;
  requestRefund(input: {
    readonly idempotencyKey: string;
    readonly now: Date;
    readonly orderId: string;
    readonly principalId: string;
  }): Promise<PaymentRefundRequest | null>;
  approveRefund(input: {
    readonly approverId: string;
    readonly now: Date;
    readonly refundRequestId: string;
  }): Promise<PaymentRefundRequest | null>;
  executeApprovedRefund(input: {
    readonly now: Date;
    readonly refundRequestId: string;
  }): Promise<PaymentRefundRequest | null>;
}

export class PaymentSignatureError extends Error {
  readonly code = "PAYMENT_SIGNATURE_INVALID";

  constructor() {
    super("The payment proof signature is invalid.");
    this.name = "PaymentSignatureError";
  }
}

export class PaymentProviderMismatchError extends Error {
  readonly code = "PAYMENT_PROVIDER_MISMATCH";

  constructor() {
    super("The payment provider response does not match the stored order snapshot.");
    this.name = "PaymentProviderMismatchError";
  }
}

function bytes(value: Uint8Array | string): Buffer {
  return typeof value === "string" ? Buffer.from(value, "utf8") : Buffer.from(value);
}

function validSignature(value: Uint8Array | string, signature: string, secret: string): boolean {
  if (secret.length === 0 || !/^[0-9a-f]{64}$/iu.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(bytes(value)).digest();
  const provided = Buffer.from(signature, "hex");
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export function verifyCheckoutSignature(input: {
  readonly paymentId: string;
  readonly providerOrderId: string;
  readonly secret: string;
  readonly signature: string;
}): boolean {
  return validSignature(
    `${input.providerOrderId}|${input.paymentId}`,
    input.signature,
    input.secret,
  );
}

export function verifyWebhookSignature(input: {
  readonly rawBody: Uint8Array | string;
  readonly secret: string;
  readonly signature: string;
}): boolean {
  return validSignature(input.rawBody, input.signature, input.secret);
}

function providerOrderMatches(order: PaymentOrderRecord, provider: ProviderOrder): boolean {
  return (
    provider.id === order.providerOrderId &&
    provider.amountPaise === PAYMENT_AMOUNT_PAISE &&
    provider.currency === PAYMENT_CURRENCY &&
    provider.receipt === order.receipt
  );
}

function paymentEventType(status: ProviderPaymentStatus): PaymentEventType | null {
  if (status === "captured") return "payment.captured";
  if (status === "authorized") return "payment.authorized";
  if (status === "failed") return "payment.failed";
  return null;
}

export function parseProviderWebhookEvent(
  rawBody: Uint8Array | string,
  eventId: string,
  occurredAt = new Date(),
): ProviderEventInput {
  let value: unknown;
  try {
    value = JSON.parse(bytes(rawBody).toString("utf8")) as unknown;
  } catch {
    throw new Error("PAYMENT_WEBHOOK_INVALID_JSON");
  }
  if (typeof value !== "object" || value === null) throw new Error("PAYMENT_WEBHOOK_INVALID");
  const root = value as Record<string, unknown>;
  const event = root.event;
  const payload = root.payload;
  if (
    (event !== "payment.authorized" &&
      event !== "payment.captured" &&
      event !== "payment.failed") ||
    typeof payload !== "object" ||
    payload === null
  ) {
    throw new Error("PAYMENT_WEBHOOK_INVALID");
  }
  const expectedStatus =
    event === "payment.captured"
      ? "captured"
      : event === "payment.authorized"
        ? "authorized"
        : "failed";
  const paymentWrapper = (payload as Record<string, unknown>).payment;
  const orderWrapper = (payload as Record<string, unknown>).order;
  const paymentEntity =
    typeof paymentWrapper === "object" && paymentWrapper !== null
      ? (paymentWrapper as Record<string, unknown>).entity
      : undefined;
  const orderEntity =
    typeof orderWrapper === "object" && orderWrapper !== null
      ? (orderWrapper as Record<string, unknown>).entity
      : undefined;
  if (typeof paymentEntity !== "object" || paymentEntity === null) {
    throw new Error("PAYMENT_WEBHOOK_INVALID");
  }
  const payment = paymentEntity as Record<string, unknown>;
  const order =
    typeof orderEntity === "object" && orderEntity !== null
      ? (orderEntity as Record<string, unknown>)
      : {};
  const status = payment.status;
  if (
    typeof payment.id !== "string" ||
    typeof payment.order_id !== "string" ||
    typeof payment.amount !== "number" ||
    typeof payment.currency !== "string" ||
    status !== expectedStatus
  ) {
    throw new Error("PAYMENT_WEBHOOK_INVALID");
  }
  return {
    amountPaise: payment.amount,
    currency: payment.currency,
    eventId,
    eventType: event,
    occurredAt,
    payloadJson: { source: "webhook" },
    payment: {
      amountPaise: payment.amount,
      currency: payment.currency,
      id: payment.id,
      orderId: payment.order_id,
      ...(typeof payment.receipt === "string" ? { receipt: payment.receipt } : {}),
      status: status as ProviderPaymentStatus,
    },
    providerOrderId: payment.order_id,
    rawBodyHash: createHash("sha256").update(bytes(rawBody)).digest("hex"),
    ...(typeof order.receipt === "string" ? { receipt: order.receipt } : {}),
    source: "webhook",
  };
}

export function createPaymentModule(dependencies: {
  readonly checkoutSignatureSecret: string;
  readonly clock?: { now(): Date };
  readonly gateway: PaymentGateway;
  readonly idGenerator?: IdGenerator;
  readonly repository: PaymentRepository;
  readonly webhookSignatureSecret: string;
}): PaymentModule {
  if (
    dependencies.checkoutSignatureSecret.length < 16 ||
    dependencies.webhookSignatureSecret.length < 16 ||
    dependencies.checkoutSignatureSecret === dependencies.webhookSignatureSecret
  )
    throw new RangeError("PAYMENT_SIGNATURE_SECRETS_INVALID");
  const clock = dependencies.clock ?? { now: () => new Date() };
  const idGenerator = dependencies.idGenerator ?? randomIdGenerator;

  async function createCheckout(input: {
    readonly now: Date;
    readonly ownerPrincipalId: string;
    readonly reportIntentId: string;
  }) {
    const orderId = idGenerator.next();
    const receipt = orderId;
    const prepared = await dependencies.repository.prepareCheckout({
      amountPaise: PAYMENT_AMOUNT_PAISE,
      currency: PAYMENT_CURRENCY,
      now: input.now,
      orderId,
      ownerPrincipalId: input.ownerPrincipalId,
      productVersion: PAYMENT_PRODUCT_VERSION,
      reportIntentId: input.reportIntentId,
      receipt,
    });
    if (prepared.providerOrderId !== undefined) {
      if (
        prepared.status === "paid" ||
        prepared.status === "refunded" ||
        prepared.status === "expired"
      )
        return { checkout: null, order: prepared };
      // Reopening requires fresh provider state, not a row awaiting a delayed webhook.
      let order: PaymentOrderRecord;
      try {
        order = (await module.reconcile({ now: input.now, orderId: prepared.id })).order;
      } catch {
        order = await dependencies.repository.markOrderAmbiguous({
          now: input.now,
          orderId: prepared.id,
        });
      }
      return {
        checkout:
          order.status === "pending" || order.status === "failed"
            ? { providerOrderId: prepared.providerOrderId, receipt: prepared.receipt }
            : null,
        order,
      };
    }
    // Only the transaction that created the durable order may create remotely. A retry after
    // a crash/timeout is reconciliation, never a second remote purchase.
    if (prepared.id !== orderId) {
      const order = await dependencies.repository.markOrderAmbiguous({
        now: input.now,
        orderId: prepared.id,
      });
      return { checkout: null, order };
    }
    let provider: ProviderOrder;
    try {
      provider = await dependencies.gateway.createOrder({
        amountPaise: PAYMENT_AMOUNT_PAISE,
        currency: PAYMENT_CURRENCY,
        receipt: prepared.receipt,
      });
    } catch {
      const order = await dependencies.repository.markOrderAmbiguous({
        now: input.now,
        orderId: prepared.id,
      });
      return { checkout: null, order };
    }
    if (
      provider.amountPaise !== PAYMENT_AMOUNT_PAISE ||
      provider.currency !== PAYMENT_CURRENCY ||
      provider.receipt !== prepared.receipt
    ) {
      await dependencies.repository.markOrderAmbiguous({ now: input.now, orderId: prepared.id });
      throw new PaymentProviderMismatchError();
    }
    const order = await dependencies.repository.adoptProviderOrder({
      now: input.now,
      amountPaise: PAYMENT_AMOUNT_PAISE,
      currency: PAYMENT_CURRENCY,
      orderId: prepared.id,
      providerOrderId: provider.id,
      receipt: prepared.receipt,
    });
    return {
      checkout:
        order.status === "pending" || order.status === "failed"
          ? { providerOrderId: provider.id, receipt: prepared.receipt }
          : null,
      order,
    };
  }

  async function settleFromProvider(
    event: ProviderEventInput,
    now: Date,
  ): Promise<PaymentSettlement> {
    return dependencies.repository.recordProviderEvent({
      ...event,
      occurredAt: event.occurredAt ?? now,
      payloadJson: event.payloadJson ?? {},
    });
  }

  const module: PaymentModule = {
    async createCheckout(input) {
      return createCheckout(input);
    },

    async getOrderStatus(input) {
      return dependencies.repository.findOrderForOwner(input.orderId, input.ownerPrincipalId);
    },

    async processWebhook(input) {
      if (
        !verifyWebhookSignature({
          rawBody: input.rawBody,
          secret: dependencies.webhookSignatureSecret,
          signature: input.signature,
        })
      ) {
        throw new PaymentSignatureError();
      }
      const now = clock.now();
      return settleFromProvider(parseProviderWebhookEvent(input.rawBody, input.eventId, now), now);
    },

    async proveCheckout(input) {
      const order = await dependencies.repository.findOrder(input.orderId);
      if (order?.providerOrderId !== input.providerOrderId || order.providerOrderId === undefined) {
        throw new PaymentProviderMismatchError();
      }
      if (
        !verifyCheckoutSignature({
          paymentId: input.paymentId,
          providerOrderId: order.providerOrderId,
          secret: dependencies.checkoutSignatureSecret,
          signature: input.signature,
        })
      ) {
        throw new PaymentSignatureError();
      }
      try {
        const providerOrder = await dependencies.gateway.fetchOrder(input.providerOrderId);
        const payments = await dependencies.gateway.fetchPaymentsForOrder(input.providerOrderId);
        if (!providerOrderMatches(order, providerOrder)) throw new PaymentProviderMismatchError();
        const payment = payments.find((candidate) => candidate.id === input.paymentId);
        if (payment === undefined) {
          await dependencies.repository.markOrderAmbiguous({
            now: input.now,
            orderId: input.orderId,
          });
          throw new Error("PAYMENT_PROVIDER_STATE_UNKNOWN");
        }
        const eventType = paymentEventType(payment.status);
        if (eventType === null) {
          await dependencies.repository.markOrderAmbiguous({
            now: input.now,
            orderId: input.orderId,
          });
          throw new Error("PAYMENT_PROVIDER_STATE_UNKNOWN");
        }
        return settleFromProvider(
          {
            amountPaise: payment.amountPaise,
            currency: payment.currency,
            eventId: `proof:${createHash("sha256").update(`${input.orderId}|${input.paymentId}|${payment.status}`).digest("hex")}`,
            eventType,
            occurredAt: input.now,
            payloadJson: { source: "checkout_proof" },
            payment,
            providerOrderId: providerOrder.id,
            rawBodyHash: createHash("sha256").update(JSON.stringify(payment)).digest("hex"),
            receipt: providerOrder.receipt,
            source: "checkout_proof",
          },
          input.now,
        );
      } catch (error) {
        if (error instanceof PaymentProviderMismatchError) throw error;
        await dependencies.repository.markOrderAmbiguous({
          now: input.now,
          orderId: input.orderId,
        });
        throw error;
      }
    },

    async reconcile(input) {
      let order = await dependencies.repository.findOrder(input.orderId);
      if (
        order?.providerOrderId === undefined &&
        order !== null &&
        dependencies.gateway.findOrderByReceipt !== undefined
      ) {
        const recovered = await dependencies.gateway.findOrderByReceipt(order.receipt);
        if (
          recovered !== null &&
          recovered.amountPaise === PAYMENT_AMOUNT_PAISE &&
          recovered.currency === PAYMENT_CURRENCY &&
          recovered.receipt === order.receipt
        ) {
          order = await dependencies.repository.adoptProviderOrder({
            now: input.now,
            amountPaise: PAYMENT_AMOUNT_PAISE,
            currency: PAYMENT_CURRENCY,
            orderId: order.id,
            providerOrderId: recovered.id,
            receipt: order.receipt,
          });
        }
      }
      if (order?.providerOrderId === undefined) {
        const ambiguous = await dependencies.repository.markOrderAmbiguous({
          now: input.now,
          orderId: input.orderId,
        });
        throw new Error(`PAYMENT_PROVIDER_ORDER_MISSING:${ambiguous.id}`);
      }
      try {
        const providerOrder = await dependencies.gateway.fetchOrder(order.providerOrderId);
        const payments = await dependencies.gateway.fetchPaymentsForOrder(order.providerOrderId);
        if (!providerOrderMatches(order, providerOrder)) throw new PaymentProviderMismatchError();
        // A verified, never-attempted remote order can resume after a creation timeout. The
        // repository also checks local payment evidence and intent expiry under the order lock.
        if (providerOrder.status === "created" && payments.length === 0) {
          const confirmation = await dependencies.repository.confirmUnattemptedOrder({
            now: input.now,
            orderId: order.id,
            providerOrderId: providerOrder.id,
          });
          if (!confirmation.confirmed) throw new Error("PAYMENT_PROVIDER_STATE_UNKNOWN");
          return { order: confirmation.order };
        }
        if (
          payments.some(
            (candidate) =>
              candidate.orderId !== providerOrder.id ||
              candidate.amountPaise !== PAYMENT_AMOUNT_PAISE ||
              candidate.currency !== PAYMENT_CURRENCY,
          )
        )
          throw new PaymentProviderMismatchError();
        const payment = payments.find(
          (candidate) =>
            candidate.status === "captured" &&
            candidate.orderId === providerOrder.id &&
            candidate.amountPaise === PAYMENT_AMOUNT_PAISE &&
            candidate.currency === PAYMENT_CURRENCY,
        );
        if (payment === undefined) {
          if (payments.length > 0 && payments.every((candidate) => candidate.status === "failed")) {
            for (const failed of payments) {
              await settleFromProvider(
                {
                  amountPaise: failed.amountPaise,
                  currency: failed.currency,
                  eventId: `reconcile:${createHash("sha256").update(`${input.orderId}|${failed.id}|failed`).digest("hex")}`,
                  eventType: "payment.failed",
                  occurredAt: input.now,
                  payloadJson: { source: "reconciliation" },
                  payment: failed,
                  providerOrderId: providerOrder.id,
                  rawBodyHash: createHash("sha256").update(JSON.stringify(failed)).digest("hex"),
                  receipt: providerOrder.receipt,
                  source: "reconciliation",
                },
                input.now,
              );
            }
            return {
              order: await dependencies.repository.confirmFailedOrder({
                now: input.now,
                orderId: order.id,
                providerOrderId: providerOrder.id,
              }),
            };
          }
          await dependencies.repository.markOrderAmbiguous({
            now: input.now,
            orderId: input.orderId,
          });
          throw new Error("PAYMENT_PROVIDER_STATE_UNKNOWN");
        }
        return settleFromProvider(
          {
            amountPaise: payment.amountPaise,
            currency: payment.currency,
            eventId: `reconcile:${createHash("sha256").update(`${input.orderId}|${payment.id}`).digest("hex")}`,
            eventType: "payment.captured",
            occurredAt: input.now,
            payloadJson: { source: "reconciliation" },
            payment,
            providerOrderId: providerOrder.id,
            rawBodyHash: createHash("sha256").update(JSON.stringify(payment)).digest("hex"),
            receipt: providerOrder.receipt,
            source: "reconciliation",
          },
          input.now,
        );
      } catch (error) {
        if (error instanceof PaymentProviderMismatchError) throw error;
        await dependencies.repository.markOrderAmbiguous({
          now: input.now,
          orderId: input.orderId,
        });
        throw error;
      }
    },

    async requestRefund(input) {
      return dependencies.repository.requestRefund({
        amountPaise: PAYMENT_AMOUNT_PAISE,
        currency: PAYMENT_CURRENCY,
        id: idGenerator.next(),
        idempotencyKey: input.idempotencyKey,
        now: input.now,
        orderId: input.orderId,
        principalId: input.principalId,
      });
    },

    async approveRefund(input) {
      return dependencies.repository.approveRefund(input);
    },

    async executeApprovedRefund(input) {
      const approved = await dependencies.repository.findRefundRequest(input.refundRequestId);
      if (approved === null || !["approved", "submitted"].includes(approved.status))
        return approved;
      const providerRefund =
        approved.providerRefundId === undefined
          ? await dependencies.gateway.requestRefund({
              amountPaise: PAYMENT_AMOUNT_PAISE,
              currency: PAYMENT_CURRENCY,
              paymentId: approved.providerPaymentId,
              receipt: approved.id,
            })
          : await dependencies.gateway.fetchRefund(approved.providerRefundId);
      if (
        providerRefund.amountPaise !== approved.amountPaise ||
        providerRefund.currency !== approved.currency ||
        providerRefund.paymentId !== approved.providerPaymentId ||
        providerRefund.receipt !== approved.id ||
        (approved.providerRefundId !== undefined &&
          providerRefund.id !== approved.providerRefundId) ||
        !/^rfnd_[A-Za-z0-9_-]{1,80}$/u.test(providerRefund.id) ||
        !["processed", "pending", "created", "failed"].includes(providerRefund.status)
      ) {
        throw new PaymentProviderMismatchError();
      }
      return dependencies.repository.recordRefundResult({
        now: input.now,
        providerRefundId: providerRefund.id,
        refundRequestId: approved.id,
        status:
          providerRefund.status === "processed"
            ? "refunded"
            : providerRefund.status === "pending" || providerRefund.status === "created"
              ? "submitted"
              : "failed",
      });
    },
  };
  return module;
}
