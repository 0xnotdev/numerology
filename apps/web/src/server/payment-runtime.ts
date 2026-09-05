import { createHash } from "node:crypto";
import {
  createPaymentHttpHandlers,
  createPaymentModule,
  type PaymentHttpHandlers,
  systemClock,
} from "@numerology/application";
import { createPostgresPaymentRepository } from "@numerology/database/payment-repository";
import type { DatabasePool } from "@numerology/database/pool";
import { createPostgresRateLimiter } from "@numerology/database/rate-limiter";
import { createPostgresSessionRepository } from "@numerology/database/session-repository";
import { createRazorpayPaymentGateway } from "./razorpay-payment-gateway";

const key = Symbol.for("numerology.payment-runtime");
type Runtime = typeof globalThis & { [key]?: PaymentHttpHandlers };
function required(
  environment: Record<string, string | undefined>,
  name: string,
  minimum = 1,
): string {
  const value = environment[name];
  if (!value || value.length < minimum) throw new Error(`RUNTIME_CONFIGURATION_MISSING_${name}`);
  return value;
}

/** Test-mode only. Real durable dependencies are mandatory; no in-memory or live-money fallback. */
export function configurePaymentRuntime(options: {
  readonly environment: Record<string, string | undefined>;
  readonly pool: DatabasePool;
  readonly origin: string;
}): void {
  const { environment, pool, origin } = options;
  if (environment.PAYMENTS_RUNTIME_ENABLED !== "true") return;
  const keyId = required(environment, "RAZORPAY_KEY_ID");
  const keySecret = required(environment, "RAZORPAY_KEY_SECRET", 16);
  const webhookSecret = required(environment, "RAZORPAY_WEBHOOK_SECRET", 16);
  const internalSecret = required(environment, "PAYMENTS_INTERNAL_BEARER_SECRET", 32);
  if (
    keySecret === webhookSecret ||
    internalSecret === keySecret ||
    internalSecret === webhookSecret
  )
    throw new Error("PAYMENT_SECRETS_MUST_BE_SEPARATE");
  const limiter = createPostgresRateLimiter(pool);
  const handlers = createPaymentHttpHandlers({
    module: createPaymentModule({
      clock: systemClock,
      repository: createPostgresPaymentRepository(pool),
      gateway: createRazorpayPaymentGateway({ keyId, keySecret, fetch: globalThis.fetch }),
      checkoutSignatureSecret: keySecret,
      webhookSignatureSecret: webhookSecret,
    }),
    clock: systemClock,
    origin,
    sessions: createPostgresSessionRepository(pool),
    keyId,
    checkoutName: environment.RAZORPAY_CHECKOUT_NAME || "Numerology Report",
    checkoutDescription: environment.RAZORPAY_CHECKOUT_DESCRIPTION || "Personal numerology report",
    internalSecret,
    requestBudget: {
      async consume(_request, identity) {
        const budgetKey = createHash("sha256").update(`payment:${identity}`).digest("hex");
        return (await limiter.consume(budgetKey, 60, 60_000)).allowed;
      },
    },
  });
  const runtime = globalThis as Runtime;
  if (runtime[key] !== undefined) throw new Error("PAYMENT_RUNTIME_ALREADY_REGISTERED");
  runtime[key] = handlers;
}

async function invoke(
  action: (handlers: PaymentHttpHandlers) => Promise<Response>,
): Promise<Response> {
  try {
    const handlers = (globalThis as Runtime)[key];
    if (handlers !== undefined) return await action(handlers);
  } catch {
    /* Keep configuration and provider diagnostics out of public responses. */
  }
  return Response.json(
    { error: { code: "PAYMENT_UNAVAILABLE" } },
    { status: 503, headers: { "cache-control": "no-store" } },
  );
}
type OrderContext = { readonly params: Promise<{ orderId: string }> };
type IntentContext = { readonly params: Promise<{ intentId: string }> };
export const paymentRoutes = {
  checkout: (request: Request, context: IntentContext) =>
    invoke(async (handlers) => handlers.checkout(request, (await context.params).intentId)),
  proof: (request: Request, context: OrderContext) =>
    invoke(async (handlers) => handlers.proof(request, (await context.params).orderId)),
  status: (request: Request, context: OrderContext) =>
    invoke(async (handlers) => handlers.status(request, (await context.params).orderId)),
  requestRefund: (request: Request, context: OrderContext) =>
    invoke(async (handlers) => handlers.requestRefund(request, (await context.params).orderId)),
  webhook: (request: Request) => invoke((handlers) => handlers.webhook(request)),
  reconcile: (request: Request) => invoke((handlers) => handlers.reconcile(request)),
  administerRefund: (request: Request) => invoke((handlers) => handlers.administerRefund(request)),
};
