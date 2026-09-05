"use client";

import { useEffect, useRef, useState } from "react";
import {
  type CheckoutProof,
  CheckoutRequestError,
  type CustomerOrder,
  type CustomerOrderStatus,
  createCheckoutClient,
} from "./checkout-client";

interface RazorpayResult {
  readonly razorpay_order_id?: string;
  readonly razorpay_payment_id?: string;
  readonly razorpay_signature?: string;
}

interface HostedCheckoutInstance {
  on(name: "payment.failed", listener: () => void): void;
  open(): void;
}

type HostedCheckoutConstructor = new (options: Record<string, unknown>) => HostedCheckoutInstance;

declare global {
  interface Window {
    Razorpay?: HostedCheckoutConstructor;
  }
}

let checkoutScript: Promise<HostedCheckoutConstructor> | undefined;

function loadHostedCheckout(): Promise<HostedCheckoutConstructor> {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  checkoutScript ??= new Promise<HostedCheckoutConstructor>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-hosted-checkout="razorpay"]',
    );
    const script = existing ?? document.createElement("script");
    const cleanup = () => {
      window.clearTimeout(timer);
      script.removeEventListener("load", onLoad);
      script.removeEventListener("error", onError);
    };
    const onError = () => {
      cleanup();
      script.remove();
      reject(new Error("CHECKOUT_SCRIPT_UNAVAILABLE"));
    };
    const onLoad = () => {
      if (!window.Razorpay) return onError();
      cleanup();
      resolve(window.Razorpay);
    };
    const timer = window.setTimeout(onError, 15_000);
    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });
    if (!existing) {
      script.async = true;
      script.dataset.hostedCheckout = "razorpay";
      script.referrerPolicy = "strict-origin";
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      document.head.append(script);
    }
  }).finally(() => {
    checkoutScript = undefined;
  });
  return checkoutScript;
}

function customerMessage(status: CustomerOrderStatus): string {
  switch (status) {
    case "paid":
      return "Payment confirmed. Your personalized report is being prepared.";
    case "ambiguous":
      return "We are still verifying this payment. Please do not pay again while we check it.";
    case "pending":
      return "Checkout is pending. No payment has been confirmed yet.";
    case "failed":
      return "The provider confirmed that this payment was not completed. No report access was granted.";
    case "expired":
      return "This checkout has expired. Your completed details are unchanged.";
    case "refunded":
      return "This payment has been refunded and report access is no longer active.";
  }
}

function safeError(cause: unknown): string {
  return cause instanceof CheckoutRequestError
    ? cause.message
    : "Secure checkout is not available right now. Please try again.";
}

function isPayable(status: CustomerOrderStatus): boolean {
  return status === "pending" || status === "failed";
}

export function CheckoutPanel({
  intentId,
  resumeExisting = false,
}: {
  readonly intentId: string;
  /** A persisted checkout/converted intent must recover its existing order, never offer a new one. */
  readonly resumeExisting?: boolean;
}) {
  const [client] = useState(() => createCheckoutClient());
  const [order, setOrder] = useState<CustomerOrder>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [canResume, setCanResume] = useState(false);
  const successSignal = useRef(false);
  const pendingProof = useRef<CheckoutProof | undefined>(undefined);
  const resumedOnMount = useRef(false);

  function acceptStatus(next: CustomerOrder): void {
    const safe =
      successSignal.current && ["pending", "failed", "expired"].includes(next.status)
        ? { ...next, status: "ambiguous" as const }
        : next;
    setOrder((current) =>
      current?.status === "refunded" || (current?.status === "paid" && safe.status !== "refunded")
        ? current
        : safe,
    );
    setCanResume(!successSignal.current && isPayable(safe.status));
  }

  async function refresh(current: CustomerOrder): Promise<void> {
    setBusy(true);
    setError(undefined);
    try {
      acceptStatus(
        pendingProof.current === undefined
          ? await client.status(current.id)
          : await client.prove(current.id, pendingProof.current),
      );
    } catch (cause) {
      setError(safeError(cause));
    } finally {
      setBusy(false);
    }
  }

  async function acceptProof(current: CustomerOrder, result: RazorpayResult): Promise<void> {
    successSignal.current = true;
    setCanResume(false);
    const paymentId = result.razorpay_payment_id;
    const providerOrderId = result.razorpay_order_id;
    const signature = result.razorpay_signature;
    if (!paymentId || !providerOrderId || !signature) {
      setOrder({ ...current, status: "ambiguous" });
      return;
    }
    pendingProof.current = { paymentId, providerOrderId, signature };
    setBusy(true);
    try {
      acceptStatus(await client.prove(current.id, pendingProof.current));
    } catch {
      // A failed browser-to-server request says nothing authoritative about provider capture.
      setOrder({ ...current, status: "ambiguous" });
    } finally {
      setBusy(false);
    }
  }

  async function begin(): Promise<void> {
    if (successSignal.current) return;
    setBusy(true);
    setError(undefined);
    setCanResume(false);
    let unopenedCheckout = false;
    try {
      const session = await client.create(intentId);
      setOrder(session.order);
      if (!session.checkout || !isPayable(session.order.status)) return;
      unopenedCheckout = true;
      const Razorpay = await loadHostedCheckout();
      const hosted = new Razorpay({
        amount: session.order.amountPaise,
        currency: session.order.currency,
        description: session.checkout.description,
        key: session.checkout.keyId,
        name: session.checkout.name,
        order_id: session.checkout.providerOrderId,
        handler: (result: RazorpayResult) => void acceptProof(session.order, result),
        modal: {
          ondismiss: () => setCanResume(!successSignal.current),
        },
      });
      hosted.on("payment.failed", () => void refresh(session.order));
      hosted.open();
      unopenedCheckout = false;
    } catch (cause) {
      setError(safeError(cause));
      setCanResume(unopenedCheckout);
    } finally {
      setBusy(false);
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: parent keys this component by immutable intent ID
  useEffect(() => {
    if (resumeExisting && !resumedOnMount.current) {
      resumedOnMount.current = true;
      void begin();
    }
  }, [resumeExisting]);

  const recoverable = order?.status === "ambiguous" || order?.status === "pending";
  return (
    <section className="checkoutPanel" aria-labelledby="checkout-title">
      <p className="eyebrow">Secure checkout</p>
      <h2 id="checkout-title">Your personalized numerology report</h2>
      <div className="checkoutTotal">
        <span>Total</span>
        <strong>₹499</strong>
      </div>
      <p className="fieldHint">
        One-time payment in INR. Razorpay securely handles payment details; this site never stores
        your card, UPI PIN or banking credentials.
      </p>
      {order ? <p role="status">{customerMessage(order.status)}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      <div className="intakeActions">
        {(!order && (!resumeExisting || error !== undefined)) ||
        (order && isPayable(order.status) && (canResume || order.status === "failed")) ? (
          <button className="button" disabled={busy} onClick={() => void begin()} type="button">
            {busy
              ? "Opening secure checkout…"
              : order
                ? "Resume secure checkout"
                : resumeExisting
                  ? "Retry secure checkout"
                  : "Pay ₹499 securely"}
          </button>
        ) : null}
        {recoverable ? (
          <button
            className="textButton"
            disabled={busy}
            onClick={() => void refresh(order)}
            type="button"
          >
            {busy ? "Checking…" : "Check payment status"}
          </button>
        ) : null}
      </div>
    </section>
  );
}
