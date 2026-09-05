import { describe, expect, it } from "vitest";
import { POST as reconcile } from "../app/api/internal/payments/reconcile/route";
import { POST as administerRefund } from "../app/api/internal/payments/refunds/route";
import { POST as proof } from "../app/api/v1/orders/[orderId]/proof/route";
import { POST as refund } from "../app/api/v1/orders/[orderId]/refund/route";
import { GET as status } from "../app/api/v1/orders/[orderId]/route";
import { POST as checkout } from "../app/api/v1/report-intents/[intentId]/checkout/route";
import { POST as webhook } from "../app/api/webhooks/razorpay/route";
import { configureProductionRuntimes } from "./production-bootstrap";

describe("payment deployment HTTP contract", () => {
  const request = new Request("https://numerology.example/api", { method: "POST" });
  const order = { params: Promise.resolve({ orderId: "0199a72d-3f45-7df1-a730-1722c2538a00" }) };
  const intent = { params: Promise.resolve({ intentId: "0199a72d-3f45-7df1-a730-1722c2538a01" }) };
  it.each([
    ["checkout", () => checkout(request, intent)],
    ["proof", () => proof(request, order)],
    ["status", () => status(new Request(request.url), order)],
    ["refund", () => refund(request, order)],
    ["webhook", () => webhook(request)],
    ["reconcile", () => reconcile(request)],
    ["refund administration", () => administerRefund(request)],
  ] as const)("fails closed without a configured durable runtime: %s", async (_name, invoke) => {
    const response = await invoke();
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: { code: "PAYMENT_UNAVAILABLE" } });
  });
  it("refuses payments without the customer/session runtime", () => {
    expect(() => configureProductionRuntimes({ PAYMENTS_RUNTIME_ENABLED: "true" })).toThrow(
      "RUNTIME_PAYMENT_CUSTOMER_REQUIRED",
    );
  });
});
