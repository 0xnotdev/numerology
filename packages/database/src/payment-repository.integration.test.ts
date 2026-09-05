import { LocalEnvelopeFieldProtector } from "@numerology/application";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabasePool, createPostgresPaymentRepository, runMigrations } from "./index";
import { resetTestDatabase, seedSyntheticIdentity } from "./test-support";

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://numerology:numerology@127.0.0.1:5432/numerology_test";
const pool = createDatabasePool({ connectionString, max: 5 });
const protector = new LocalEnvelopeFieldProtector({
  keyEncryptionKey: Buffer.alloc(32, 0x61),
  keyId: "checkpoint8-payment-test-v1",
  lookupKey: Buffer.alloc(32, 0x62),
});
const now = new Date("2026-09-04T00:00:00.000Z");
const ids = {
  ownerPrincipalId: "0199a72d-3f45-7df1-a730-1722c2538b00",
  subjectId: "0199a72d-3f45-7df1-a730-1722c2538b01",
  reportIntentId: "0199a72d-3f45-7df1-a730-1722c2538b02",
  orderId: "0199a72d-3f45-7df1-a730-1722c2538b03",
};

describe("durable payment repository", () => {
  beforeAll(async () => {
    await resetTestDatabase(pool, connectionString);
    await runMigrations(pool);
    await seedSyntheticIdentity(pool, protector, {
      now,
      principalId: ids.ownerPrincipalId,
      subjectId: ids.subjectId,
    });
    await pool.query(
      `INSERT INTO report_intents
         (id, owner_principal_id, subject_id, status, locale, input_schema_version,
          draft_ciphertext, input_snapshot_ciphertext, input_hash, notice_version,
          required_consent_at, expires_at, created_at, updated_at)
       VALUES ($1, $2, $3, 'complete', 'en-IN', '1.0.0', $4, $4, $5, 'cp8.test.v1', $6, $7, $6, $6)`,
      [
        ids.reportIntentId,
        ids.ownerPrincipalId,
        ids.subjectId,
        Buffer.from("draft"),
        Buffer.alloc(32, 1),
        now,
        new Date(now.getTime() + 86_400_000),
      ],
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  it("converges concurrent duplicate captures into one fulfilment set", async () => {
    const repository = createPostgresPaymentRepository(pool);
    await repository.prepareCheckout({
      amountPaise: 49900,
      currency: "INR",
      now,
      orderId: ids.orderId,
      ownerPrincipalId: ids.ownerPrincipalId,
      productVersion: "personal-numerology-report-v1",
      reportIntentId: ids.reportIntentId,
      receipt: ids.orderId,
    });
    await repository.adoptProviderOrder({
      now,
      amountPaise: 49900,
      currency: "INR",
      orderId: ids.orderId,
      providerOrderId: "order_cp8_1",
      receipt: ids.orderId,
    });

    const event = {
      amountPaise: 49900,
      currency: "INR" as const,
      eventId: "evt_cp8_capture_1",
      eventType: "payment.captured" as const,
      occurredAt: now,
      payloadJson: { source: "webhook" },
      payment: {
        amountPaise: 49900,
        currency: "INR" as const,
        id: "pay_cp8_1",
        orderId: "order_cp8_1",
        status: "captured" as const,
      },
      providerOrderId: "order_cp8_1",
      rawBodyHash: "a".repeat(64),
      receipt: ids.orderId,
      source: "webhook" as const,
    };
    const outcomes = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        repository.recordProviderEvent({
          ...event,
          eventId: index === 0 ? event.eventId : `${event.eventId}_${index}`,
        }),
      ),
    );

    expect(outcomes.some((outcome) => outcome.fulfilled)).toBe(true);
    expect(outcomes.filter((outcome) => outcome.fulfilled)).toHaveLength(20);
    const order = await repository.findOrderForOwner(ids.orderId, ids.ownerPrincipalId);
    expect(order).toMatchObject({
      amountPaise: 49900,
      currency: "INR",
      reportIntentId: ids.reportIntentId,
      status: "paid",
    });
    expect(order?.reportId).toBeDefined();
    await expect(
      pool.query(
        `SELECT
           (SELECT count(*)::int FROM reports WHERE order_id = $1 AND status = 'pending') AS reports,
           (SELECT count(*)::int FROM entitlements WHERE source_order_id = $1) AS entitlements,
           (SELECT count(*)::int FROM outbox_events WHERE order_id = $1) AS outbox`,
        [ids.orderId],
      ),
    ).resolves.toMatchObject({
      rows: [{ entitlements: 1, outbox: 1, reports: 1 }],
    });
  });
});
