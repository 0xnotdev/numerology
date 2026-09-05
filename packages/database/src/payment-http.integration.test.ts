import { createHash, createHmac, randomUUID } from "node:crypto";
import {
  createPaymentModule,
  LocalEnvelopeFieldProtector,
  type PaymentGateway,
} from "@numerology/application";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPaymentHttpHandlers } from "../../application/src/payment-http";
import { createDatabasePool, createPostgresPaymentRepository, runMigrations } from "./index";
import { createPostgresSessionRepository } from "./session-repository";
import { resetTestDatabase, seedSyntheticIdentity } from "./test-support";

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://numerology:numerology@127.0.0.1:5432/numerology_test";
const pool = createDatabasePool({ connectionString, max: 5 });
const now = new Date("2026-09-04T12:00:00Z");
const origin = "https://numerology.test";
const checkoutSecret = "synthetic-checkout-secret-32-characters";
const webhookSecret = "synthetic-webhook-secret-32-characters";
const internalSecret = "synthetic-reconciliation-secret-32-chars";
const protector = new LocalEnvelopeFieldProtector({
  keyEncryptionKey: Buffer.alloc(32, 0x61),
  keyId: "cp8-test",
  lookupKey: Buffer.alloc(32, 0x62),
});

async function setup() {
  const principalId = randomUUID();
  const subjectId = randomUUID();
  const intentId = randomUUID();
  const token = Buffer.from(randomUUID()).subarray(0, 32).toString("base64url");
  const csrf = Buffer.from(randomUUID()).subarray(0, 32).toString("base64url");
  await seedSyntheticIdentity(pool, protector, { now, principalId, subjectId });
  await pool.query(
    `INSERT INTO report_intents
    (id,owner_principal_id,subject_id,status,locale,input_schema_version,draft_ciphertext,
     input_snapshot_ciphertext,input_hash,notice_version,required_consent_at,expires_at,created_at,updated_at)
    VALUES ($1,$2,$3,'complete','en-IN','1.0.0',$4,$4,$5,'cp8.test',$6,$7,$6,$6)`,
    [
      intentId,
      principalId,
      subjectId,
      Buffer.from("encrypted-synthetic"),
      Buffer.alloc(32, 1),
      now,
      new Date(now.getTime() + 86_400_000),
    ],
  );
  await pool.query(
    `INSERT INTO sessions(id,principal_id,token_digest,csrf_digest,last_seen_at,expires_at,absolute_expires_at,created_at)
    VALUES($1,$2,$3,$4,$5,$6,$6,$5)`,
    [
      randomUUID(),
      principalId,
      createHash("sha256").update(`numerology:session:v1:${token}`).digest(),
      createHash("sha256").update(`numerology:csrf:v1:${csrf}`).digest(),
      now,
      new Date(now.getTime() + 86_400_000),
    ],
  );
  const providerId = `order_${randomUUID().replaceAll("-", "")}`;
  const paymentId = `pay_${randomUUID().replaceAll("-", "")}`;
  let receipt = "";
  let remoteExists = false;
  let timeout = false;
  let paymentStatus: "created" | "authorized" | "captured" | "failed" = "captured";
  let remotePayments: Awaited<ReturnType<PaymentGateway["fetchPaymentsForOrder"]>> | undefined;
  let amount = 49_900;
  let currency = "INR";
  let noPayments = false;
  let refundPending = false;
  let refundMismatch = false;
  let refundUnavailable = false;
  let createBarrier: Promise<void> | undefined;
  let createStarted: (() => void) | undefined;
  const remoteOrder = () => ({
    amountPaise: amount,
    currency,
    id: providerId,
    receipt,
    status: "created",
  });
  const gateway: PaymentGateway = {
    fetchRefund: async (providerRefundId) => ({
      amountPaise: refundMismatch ? 1 : 49_900,
      currency: "INR",
      paymentId,
      receipt: providerRefundId
        .slice(5)
        .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/u, "$1-$2-$3-$4-$5"),
      id: providerRefundId,
      status: refundPending ? "pending" : "processed",
    }),
    createOrder: async (input) => {
      receipt = input.receipt;
      remoteExists = true;
      createStarted?.();
      await createBarrier;
      if (timeout) throw Error("secret provider diagnostics");
      return remoteOrder();
    },
    findOrderByReceipt: async () => {
      if (timeout) throw Error("provider unavailable");
      return remoteExists ? remoteOrder() : null;
    },
    fetchOrder: async () => {
      if (timeout) throw Error("provider unavailable");
      return remoteOrder();
    },
    fetchPaymentsForOrder: async () =>
      remotePayments ??
      (noPayments
        ? []
        : [
            {
              amountPaise: amount,
              currency,
              id: paymentId,
              orderId: providerId,
              status: paymentStatus,
            },
          ]),
    requestRefund: async (input) => {
      if (refundUnavailable) throw new Error("provider unavailable");
      return {
        amountPaise: refundMismatch ? 1 : input.amountPaise,
        currency: input.currency,
        paymentId: input.paymentId,
        receipt: input.receipt,
        id: `rfnd_${input.receipt.replaceAll("-", "")}`,
        status: refundPending ? "pending" : "processed",
      };
    },
  };
  const repository = createPostgresPaymentRepository(pool);
  const module = createPaymentModule({
    gateway,
    repository,
    checkoutSignatureSecret: checkoutSecret,
    webhookSignatureSecret: webhookSecret,
    clock: { now: () => now },
  });
  const handlers = createPaymentHttpHandlers({
    module,
    clock: { now: () => now },
    origin,
    sessions: createPostgresSessionRepository(pool),
    keyId: "rzp_test_1234567890",
    checkoutName: "Numerology Report",
    internalSecret,
    requestBudget: { consume: async () => true },
  });
  const request = (path: string, body?: unknown) =>
    new Request(`${origin}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        origin,
        cookie: `__Host-numerology_session=${token}`,
        "x-csrf-token": csrf,
        "idempotency-key": randomUUID(),
        "content-type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const create = () => handlers.checkout(request("/checkout", {}), intentId);
  const webhook = (
    eventId = randomUUID(),
    status = "captured",
    event = `payment.${status}`,
    overrides: Record<string, unknown> = {},
  ) => {
    const rawBody = JSON.stringify({
      event,
      payload: {
        payment: {
          entity: {
            id: paymentId,
            order_id: providerId,
            amount: 49_900,
            currency: "INR",
            status,
            email: "private-canary@example.invalid",
            ...overrides,
          },
        },
      },
    });
    return new Request(`${origin}/webhook`, {
      method: "POST",
      body: rawBody,
      headers: {
        "x-razorpay-event-id": eventId,
        "x-razorpay-signature": createHmac("sha256", webhookSecret).update(rawBody).digest("hex"),
      },
    });
  };
  return {
    principalId,
    intentId,
    providerId,
    paymentId,
    module,
    repository,
    handlers,
    request,
    create,
    webhook,
    setTimeout: (value: boolean) => {
      timeout = value;
    },
    setStatus: (value: typeof paymentStatus) => {
      paymentStatus = value;
    },
    setPayments: (value: NonNullable<typeof remotePayments>) => {
      remotePayments = value;
    },
    setNoPayments: () => {
      noPayments = true;
    },
    setRefund: (mode: "pending" | "processed" | "mismatch" | "unavailable") => {
      refundPending = mode === "pending";
      refundMismatch = mode === "mismatch";
      refundUnavailable = mode === "unavailable";
    },
    delayCreation: () => {
      let release!: () => void;
      const started = new Promise<void>((resolve) => {
        createStarted = resolve;
      });
      createBarrier = new Promise<void>((resolve) => {
        release = resolve;
      });
      return { started, release };
    },
    setAmount: (value: number) => {
      amount = value;
    },
    setCurrency: (value: string) => {
      currency = value;
    },
  };
}

describe("payment HTTP and durable fulfilment contract", () => {
  beforeAll(async () => {
    await resetTestDatabase(pool, connectionString);
    await runMigrations(pool);
  });
  afterAll(async () => {
    await pool.end();
  });

  it("grants exactly one fulfilment set for twenty concurrent duplicate raw webhooks and survives reorder", async () => {
    const s = await setup();
    const created = await s.create();
    expect(created.status).toBe(201);
    const { order } = await orderBody(created);
    expect(order).toMatchObject({ amountPaise: 49_900, currency: "INR", status: "pending" });
    const eventId = randomUUID();
    const replies = await Promise.all(
      Array.from({ length: 20 }, () => s.handlers.webhook(s.webhook(eventId))),
    );
    expect(replies.map((r) => r.status)).toEqual(Array(20).fill(200));
    const first = await s.repository.findFulfilment(order.id);
    expect(first).toMatchObject({
      reportId: expect.any(String),
      entitlementId: expect.any(String),
      outboxEventId: expect.any(String),
    });
    await s.handlers.webhook(s.webhook(randomUUID(), "authorized"));
    await s.handlers.webhook(s.webhook(randomUUID(), "failed"));
    expect(await s.repository.findFulfilment(order.id)).toEqual(first);
    expect((await s.repository.findOrderForOwner(order.id, s.principalId))?.status).toBe("paid");
  });

  it("rejects a changed raw body, same-ID substituted event, and event/status contradiction", async () => {
    const s = await setup();
    await s.create();
    const original = s.webhook();
    const altered = new Request(original.url, {
      method: "POST",
      headers: original.headers,
      body: `${await original.text()} `,
    });
    expect((await s.handlers.webhook(altered)).status).toBe(400);
    const eventId = randomUUID();
    expect((await s.handlers.webhook(s.webhook(eventId, "authorized"))).status).toBe(200);
    expect((await s.handlers.webhook(s.webhook(eventId))).status).toBe(409);
    expect(
      (await s.handlers.webhook(s.webhook(randomUUID(), "authorized", "payment.captured"))).status,
    ).toBe(400);
  });

  it.each([{ amount: 1 }, { currency: "USD" }, { order_id: "order_wrong12345" }])(
    "rejects wrong provider facts %j without fulfilment",
    async (facts) => {
      const s = await setup();
      const { order } = await orderBody(await s.create());
      expect(
        (await s.handlers.webhook(s.webhook(randomUUID(), "captured", "payment.captured", facts)))
          .status,
      ).not.toBe(200);
      expect(await s.repository.findFulfilment(order.id)).toBeNull();
    },
  );

  it("never grants from callback-only authorization and recovers later capture using the same proof", async () => {
    const s = await setup();
    const { order } = await orderBody(await s.create());
    s.setStatus("authorized");
    const proof = {
      providerOrderId: s.providerId,
      paymentId: s.paymentId,
      signature: createHmac("sha256", checkoutSecret)
        .update(`${s.providerId}|${s.paymentId}`)
        .digest("hex"),
    };
    expect(
      (await orderBody(await s.handlers.proof(s.request("/proof", proof), order.id))).order.status,
    ).not.toBe("paid");
    expect(await s.repository.findFulfilment(order.id)).toBeNull();
    s.setStatus("captured");
    await expect(
      s.module.proveCheckout({ ...proof, now, orderId: order.id }),
    ).resolves.toMatchObject({ order: { status: "paid" } });
    expect(
      (await orderBody(await s.handlers.proof(s.request("/proof", proof), order.id))).order.status,
    ).toBe("paid");
  });

  it("returns a durable ambiguous order on create timeout and reconciles after provider recovery", async () => {
    const s = await setup();
    s.setTimeout(true);
    const created = await s.create();
    expect(created.status).toBe(202);
    const { order, checkout } = await orderBody(created);
    expect(order.status).toBe("ambiguous");
    expect(checkout).toBeNull();
    s.setTimeout(false);
    const reconciled = await s.handlers.reconcile(
      new Request(`${origin}/reconcile`, {
        method: "POST",
        headers: { authorization: `Bearer ${internalSecret}`, "content-type": "application/json" },
        body: JSON.stringify({ orderId: order.id }),
      }),
    );
    expect(reconciled.status).toBe(200);
    expect((await orderBody(reconciled)).order.status).toBe("paid");
  });

  it("denies unauthenticated, cross-owner, missing-CSRF and unauthorized operator requests", async () => {
    const s = await setup();
    const { order } = await orderBody(await s.create());
    expect((await s.handlers.status(new Request(`${origin}/status`), order.id)).status).toBe(401);
    const other = await setup();
    expect((await s.handlers.status(other.request("/status"), order.id)).status).toBe(404);
    const csrf = s.request("/checkout", {});
    csrf.headers.delete("x-csrf-token");
    expect((await s.handlers.checkout(csrf, s.intentId)).status).toBe(403);
    expect(
      (await s.handlers.reconcile(s.request("/reconcile", { orderId: order.id }))).status,
    ).toBe(404);
    const badProof = {
      providerOrderId: s.providerId,
      paymentId: s.paymentId,
      signature: "a".repeat(64),
    };
    expect((await s.handlers.proof(s.request("/proof", badProof), order.id)).status).toBe(400);
  });

  it("requires explicit refund approval and preserves an idempotent receipt after refund", async () => {
    const s = await setup();
    const { order } = await orderBody(await s.create());
    await s.handlers.webhook(s.webhook());
    const key = randomUUID();
    const request = { orderId: order.id, principalId: s.principalId, idempotencyKey: key, now };
    const refund = await s.module.requestRefund(request);
    expect(refund?.status).toBe("requested");
    if (refund === null) throw new Error("Expected a persisted refund request");
    expect(
      (await s.module.executeApprovedRefund({ now, refundRequestId: refund.id }))?.status,
    ).toBe("requested");
    await s.module.approveRefund({ now, refundRequestId: refund.id, approverId: s.principalId });
    expect(
      (await s.module.executeApprovedRefund({ now, refundRequestId: refund.id }))?.status,
    ).toBe("refunded");
    expect((await s.module.requestRefund(request))?.id).toBe(refund?.id);
    await s.handlers.webhook(s.webhook());
    expect((await s.repository.findOrderForOwner(order.id, s.principalId))?.status).toBe(
      "refunded",
    );
  });

  it("recovers an unattempted timeout order without requiring a payment to exist already", async () => {
    const s = await setup();
    s.setNoPayments();
    s.setTimeout(true);
    const initial = await orderBody(await s.create());
    s.setTimeout(false);
    await expect(s.module.reconcile({ now, orderId: initial.order.id })).resolves.toMatchObject({
      order: { status: "pending" },
    });
    const resumed = await orderBody(await s.create());
    expect(resumed.order.id).toBe(initial.order.id);
    expect(resumed.checkout).toMatchObject({ providerOrderId: s.providerId });
    expect(await s.repository.findFulfilment(initial.order.id)).toBeNull();
  });

  it("recovers a concurrent create race into the same unattempted provider order", async () => {
    const s = await setup();
    s.setNoPayments();
    const gate = s.delayCreation();
    const first = s.create();
    await gate.started;
    const second = await orderBody(await s.create());
    expect(second.order.status).toBe("ambiguous");
    gate.release();
    const created = await orderBody(await first);
    expect(created.order.id).toBe(second.order.id);
    await s.module.reconcile({ now, orderId: created.order.id });
    const resumed = await orderBody(await s.create());
    expect(resumed.order.status).toBe("pending");
    expect(resumed.checkout).toMatchObject({ providerOrderId: s.providerId });
  });

  it("rolls back capture completely if the outbox insert fails, then accepts the same delivery", async () => {
    const s = await setup();
    const { order } = await orderBody(await s.create());
    const eventId = randomUUID();
    await pool.query(`CREATE TRIGGER cp8_fault BEFORE INSERT ON outbox_events
      FOR EACH ROW EXECUTE FUNCTION reject_append_only_event_mutation()`);
    try {
      expect((await s.handlers.webhook(s.webhook(eventId))).status).toBe(503);
      expect(await s.repository.findFulfilment(order.id)).toBeNull();
      expect((await s.repository.findOrder(order.id))?.status).toBe("pending");
    } finally {
      await pool.query(`DROP TRIGGER cp8_fault ON outbox_events`);
    }
    expect((await s.handlers.webhook(s.webhook(eventId))).status).toBe(200);
    expect(await s.repository.findFulfilment(order.id)).not.toBeNull();
  });

  it("does not let a delayed failure downgrade an uncertain newer payment", async () => {
    const s = await setup();
    const { order } = await orderBody(await s.create());
    await s.repository.markOrderAmbiguous({ now, orderId: order.id });
    expect((await s.handlers.webhook(s.webhook(randomUUID(), "failed"))).status).toBe(200);
    expect((await s.repository.findOrder(order.id))?.status).toBe("ambiguous");
    expect(await s.repository.findFulfilment(order.id)).toBeNull();
  });

  it("expires an unpaid existing checkout but still accepts capture and paid recovery after expiry", async () => {
    const s = await setup();
    await orderBody(await s.create());
    const later = new Date(now.getTime() + 2 * 86_400_000);
    const expired = await s.module.createCheckout({
      now: later,
      ownerPrincipalId: s.principalId,
      reportIntentId: s.intentId,
    });
    expect(expired.order.status).toBe("expired");
    expect(expired.checkout).toBeNull();
    expect((await s.handlers.webhook(s.webhook())).status).toBe(200);
    const paid = await s.module.createCheckout({
      now: later,
      ownerPrincipalId: s.principalId,
      reportIntentId: s.intentId,
    });
    expect(paid.order.status).toBe("paid");
    expect(paid.checkout).toBeNull();
  });

  it("revalidates an existing checkout against the provider before letting it reopen", async () => {
    const s = await setup();
    const { order } = await orderBody(await s.create());
    s.setStatus("authorized");
    const repeated = await orderBody(await s.create());
    expect(repeated.order.id).toBe(order.id);
    expect(repeated.checkout).toBeNull();
    expect(repeated.order.status).toBe("ambiguous");
    s.setStatus("captured");
    expect((await orderBody(await s.create())).order.status).toBe("paid");
  });

  it("reopens the same provider order only when every authoritative attempt has failed", async () => {
    const s = await setup();
    const { order } = await orderBody(await s.create());
    s.setStatus("failed");
    expect((await s.handlers.webhook(s.webhook(randomUUID(), "failed"))).status).toBe(200);
    const resumed = await orderBody(await s.create());
    expect(resumed.order).toMatchObject({ id: order.id, status: "failed" });
    expect(resumed.checkout).toMatchObject({ providerOrderId: s.providerId });
    expect(await s.repository.findFulfilment(order.id)).toBeNull();
  });

  it("does not reopen when empty remote state contradicts existing local payment evidence", async () => {
    const s = await setup();
    await orderBody(await s.create());
    s.setStatus("failed");
    expect((await s.handlers.webhook(s.webhook(randomUUID(), "failed"))).status).toBe(200);
    s.setNoPayments();
    const checked = await orderBody(await s.create());
    expect(checked.order.status).toBe("ambiguous");
    expect(checked.checkout).toBeNull();
  });

  it("converges reversed multi-attempt provider failures before reopening", async () => {
    const s = await setup();
    const { order } = await orderBody(await s.create());
    const paymentA = "pay_authorized_attempt_A";
    const paymentB = "pay_failed_attempt_B";
    expect(
      (
        await s.handlers.webhook(
          s.webhook(randomUUID(), "authorized", "payment.authorized", { id: paymentA }),
        )
      ).status,
    ).toBe(200);
    s.setPayments([
      {
        amountPaise: 49_900,
        currency: "INR",
        id: paymentB,
        orderId: s.providerId,
        status: "failed",
      },
      {
        amountPaise: 49_900,
        currency: "INR",
        id: paymentA,
        orderId: s.providerId,
        status: "failed",
      },
    ]);
    const resumed = await orderBody(await s.create());
    expect(resumed.order).toMatchObject({ id: order.id, status: "failed" });
    expect(resumed.checkout).toMatchObject({ providerOrderId: s.providerId });
  });

  it("enforces body bounds, CSRF origin, idempotency and explicit field contracts", async () => {
    const s = await setup();
    const originRequest = s.request("/checkout", {});
    originRequest.headers.set("origin", "https://attacker.invalid");
    expect((await s.handlers.checkout(originRequest, s.intentId)).status).toBe(403);
    const keyRequest = s.request("/checkout", {});
    keyRequest.headers.delete("idempotency-key");
    expect((await s.handlers.checkout(keyRequest, s.intentId)).status).toBe(400);
    expect(
      (
        await s.handlers.checkout(
          s.request("/checkout", { amountPaise: 1, paid: true }),
          s.intentId,
        )
      ).status,
    ).toBe(400);
    expect(
      (await s.handlers.checkout(s.request("/checkout", { extra: "x".repeat(9000) }), s.intentId))
        .status,
    ).toBe(413);
    expect((await s.handlers.checkout(s.request("/checkout"), s.intentId)).status).toBe(405);
    const oversized = new Request(`${origin}/webhook`, {
      method: "POST",
      headers: s.webhook().headers,
      body: "x".repeat(70_000),
    });
    expect((await s.handlers.webhook(oversized)).status).toBe(413);
  });

  it("rejects wrong receipts and cross-owner checkout/proof/refund attempts", async () => {
    const s = await setup();
    const { order } = await orderBody(await s.create());
    const other = await setup();
    expect((await s.handlers.checkout(other.request("/checkout", {}), s.intentId)).status).toBe(
      404,
    );
    expect((await s.handlers.proof(other.request("/proof", {}), order.id)).status).toBe(404);
    expect((await s.handlers.requestRefund(other.request("/refund", {}), order.id)).status).toBe(
      404,
    );
    expect(
      (
        await s.handlers.webhook(
          s.webhook(randomUUID(), "captured", "payment.captured", { receipt: randomUUID() }),
        )
      ).status,
    ).toBe(409);
    expect(await s.repository.findFulfilment(order.id)).toBeNull();
  });

  it("persists asynchronous refunds, refuses wrong provider confirmation, and converges concurrent approvals/retries", async () => {
    const s = await setup();
    const { order } = await orderBody(await s.create());
    await s.handlers.webhook(s.webhook());
    const requests = await Promise.all(
      Array.from({ length: 10 }, () =>
        s.module.requestRefund({
          now,
          orderId: order.id,
          principalId: s.principalId,
          idempotencyKey: randomUUID(),
        }),
      ),
    );
    expect(new Set(requests.map((r) => r?.id)).size).toBe(1);
    const refundId = requests[0]?.id;
    if (refundId === undefined) throw new Error("Expected one persisted refund request");
    await s.module.approveRefund({ now, refundRequestId: refundId, approverId: s.principalId });
    s.setRefund("unavailable");
    await expect(
      s.module.executeApprovedRefund({ now, refundRequestId: refundId }),
    ).rejects.toThrow();
    expect((await s.repository.findRefundRequest(refundId))?.status).toBe("approved");
    s.setRefund("pending");
    expect((await s.module.executeApprovedRefund({ now, refundRequestId: refundId }))?.status).toBe(
      "submitted",
    );
    expect((await s.repository.findOrder(order.id))?.status).toBe("paid");
    s.setRefund("mismatch");
    await expect(
      s.module.executeApprovedRefund({ now, refundRequestId: refundId }),
    ).rejects.toThrow();
    expect((await s.repository.findRefundRequest(refundId))?.status).toBe("submitted");
    s.setRefund("processed");
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        s.module.executeApprovedRefund({ now, refundRequestId: refundId }),
      ),
    );
    expect(results.every((r) => r?.status === "refunded")).toBe(true);
    expect((await s.repository.findOrder(order.id))?.status).toBe("refunded");
  });
});

async function orderBody(response: Response) {
  const value = await response.json();
  expect(value).toMatchObject({ order: { id: expect.any(String), status: expect.any(String) } });
  return value as { order: { id: string; status: string }; checkout: unknown };
}
