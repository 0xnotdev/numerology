import { randomUUID } from "node:crypto";
import { LocalEnvelopeFieldProtector } from "@numerology/application";
import { buildCheckpointFourReportFixture, parseReportId } from "@numerology/report";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import checkpointFourRelease from "../../../data/doctrine/releases/checkpoint4-fallback.compiled.json";
import {
  createDatabasePool,
  createPostgresPaymentRepository,
  createReportGenerationRepository,
  runMigrations,
  verifyCheckpointEightSchema,
} from "./index";
import { resetTestDatabase, seedCheckpointFourReadyReportFixture } from "./test-support";

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://numerology:numerology@127.0.0.1:5432/numerology_test";
const pool = createDatabasePool({ connectionString, max: 3 });
const repository = createPostgresPaymentRepository(pool);
const protector = new LocalEnvelopeFieldProtector({
  keyEncryptionKey: Buffer.alloc(32, 0x71),
  keyId: "checkpoint8-schema-test-v1",
  lookupKey: Buffer.alloc(32, 0x72),
});
const fixture = buildCheckpointFourReportFixture(checkpointFourRelease);
const now = new Date("2026-09-04T00:00:00.000Z");
const fixtureIds = {
  entitlementId: "0199a72d-3f45-7df1-a730-1722c2538a04",
  environment: "test" as const,
  intentId: "0199a72d-3f45-7df1-a730-1722c2538a01",
  jobAttemptId: "0199a72d-3f45-7df1-a730-1722c2538a05",
  now,
  orderId: "0199a72d-3f45-7df1-a730-1722c2538a02",
  principalId: "0199a72d-3f45-7df1-a730-1722c2538a00",
  subjectId: "0199a72d-3f45-7df1-a730-1722c2538a03",
};

// These are the public SQL generation-artifact fields, not repository implementation details.
const artifactColumns = [
  "input_snapshot_ciphertext",
  "calculation_snapshot_ciphertext",
  "evidence_snapshot_ciphertext",
  "plan_snapshot_ciphertext",
  "structured_report_ciphertext",
  "input_hash",
  "plan_hash",
  "report_hash",
  "verification_json",
  "verification_record_hash",
  "engine_version",
  "doctrine_version",
  "doctrine_hash",
  "planner_version",
  "report_schema_version",
  "writer_version",
  "writer_policy_version",
  "locale_pack_version",
  "safety_policy_version",
  "verifier_version",
  "renderer_version",
  "ready_at",
] as const;

async function capturedOrder() {
  const orderId = randomUUID();
  const intentId = randomUUID();
  const providerOrderId = `order_${randomUUID().replaceAll("-", "")}`;
  const providerPaymentId = `pay_${randomUUID().replaceAll("-", "")}`;
  const eventId = `evt_${randomUUID()}`;
  // Reuse an actual encrypted, completed synthetic intake without bypassing snapshot checks.
  await pool.query(
    `INSERT INTO report_intents
       SELECT (jsonb_populate_record(NULL::report_intents,
         to_jsonb(existing) || jsonb_build_object('id', $2::text))).*
       FROM report_intents AS existing WHERE id = $1`,
    [fixtureIds.intentId, intentId],
  );
  await repository.prepareCheckout({
    amountPaise: 49_900,
    currency: "INR",
    now,
    orderId,
    ownerPrincipalId: fixtureIds.principalId,
    productVersion: "personal-numerology-report-v1",
    receipt: orderId,
    reportIntentId: intentId,
  });
  await repository.adoptProviderOrder({
    amountPaise: 49_900,
    currency: "INR",
    now,
    orderId,
    providerOrderId,
    receipt: orderId,
  });
  const settlement = await repository.recordProviderEvent({
    amountPaise: 49_900,
    currency: "INR",
    eventId,
    eventType: "payment.captured",
    occurredAt: now,
    payloadJson: { source: "webhook" },
    payment: {
      amountPaise: 49_900,
      currency: "INR",
      id: providerPaymentId,
      orderId: providerOrderId,
      status: "captured",
    },
    providerOrderId,
    rawBodyHash: "a".repeat(64),
    receipt: orderId,
    source: "webhook",
  });
  const fulfilment = await repository.findFulfilment(orderId);
  if (!fulfilment) throw new Error("Expected the captured order's public fulfilment set.");
  return {
    ...fulfilment,
    reportId: parseReportId(fulfilment.reportId),
    eventId,
    orderId,
    paymentId: settlement.payment.id,
    providerPaymentId,
  };
}

function promoteReport(reportId: string, identityChange = "") {
  return pool.query(
    `UPDATE reports AS pending SET status = 'ready',
       ${artifactColumns.map((column) => `${column} = template.${column}`).join(", ")}
       ${identityChange ? `, ${identityChange}` : ""}
       FROM reports AS template WHERE pending.id = $1 AND template.id = $2`,
    [reportId, fixture.report.reportId],
  );
}

describe("Checkpoint 8 migrated SQL schema contract", () => {
  beforeAll(async () => {
    await resetTestDatabase(pool, connectionString);
    await runMigrations(pool);
    await seedCheckpointFourReadyReportFixture(pool, protector, fixture, fixtureIds);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("finds the complete payment catalogue, including 0014 binding and immutable-evidence protections", async () => {
    await expect(verifyCheckpointEightSchema(pool)).resolves.toEqual({
      missingConstraints: [],
      missingIndexes: [],
      missingTables: [],
      missingTriggers: [],
      valid: true,
    });
  });

  it("permits one same-identity all-null pending to all-artifacts ready transition", async () => {
    const order = await capturedOrder();
    const reports = createReportGenerationRepository(pool);
    await expect(reports.findReadyById(order.reportId)).resolves.toBeNull();
    await expect(
      pool.query(
        `SELECT status, num_nonnulls(${artifactColumns.join(", ")}) AS populated
         FROM reports WHERE id = $1`,
        [order.reportId],
      ),
    ).resolves.toMatchObject({ rows: [{ status: "pending", populated: 0 }] });

    await expect(
      pool.query("UPDATE reports SET status = 'ready' WHERE id = $1", [order.reportId]),
    ).rejects.toMatchObject({ code: "23514", constraint: "reports_generation_artifacts_shape" });
    await expect(promoteReport(order.reportId)).resolves.toMatchObject({ rowCount: 1 });
    await expect(reports.findReadyById(order.reportId)).resolves.toMatchObject({
      createdAt: now,
      locale: "en-IN",
      orderId: order.orderId,
      reportId: order.reportId,
      reportVersion: 1,
      status: "ready",
      subjectId: fixtureIds.subjectId,
      reportHash: fixture.report.reportHash,
    });
    await expect(
      pool.query(
        `SELECT num_nonnulls(${artifactColumns.join(", ")}) AS populated FROM reports WHERE id = $1`,
        [order.reportId],
      ),
    ).resolves.toMatchObject({ rows: [{ populated: 22 }] });
    await expect(promoteReport(order.reportId)).rejects.toMatchObject({ code: "23514" });
  });

  it.each([
    ["id", "id = template.id"],
    ["order", "order_id = template.order_id"],
    ["subject", "subject_id = '0199a72d-3f45-7df1-a730-1722c2538aff'::uuid"],
    ["report version", "report_version = pending.report_version + 1"],
    ["locale", "locale = 'hi-IN'"],
    ["retention", "purge_after = pending.purge_after + interval '1 day'"],
    ["creation time", "created_at = pending.created_at + interval '1 second'"],
  ])("rejects a changed %s during pending-report completion", async (_identity, assignment) => {
    const order = await capturedOrder();
    await expect(promoteReport(order.reportId, assignment)).rejects.toMatchObject({
      code: "23514",
    });
    await expect(
      createReportGenerationRepository(pool).findReadyById(order.reportId),
    ).resolves.toBeNull();
  });

  it("keeps every ready report artifact immutable while permitting lifecycle bookkeeping", async () => {
    for (const column of artifactColumns) {
      await expect(
        pool.query(`UPDATE reports SET ${column} = ${column} WHERE id = $1`, [
          fixture.report.reportId,
        ]),
        column,
      ).rejects.toMatchObject({ code: "23514" });
    }
    await expect(
      pool.query(
        "UPDATE reports SET updated_at = updated_at, version = version + 1 WHERE id = $1",
        [fixture.report.reportId],
      ),
    ).resolves.toMatchObject({ rowCount: 1 });
    await expect(
      createReportGenerationRepository(pool).findReadyById(fixture.report.reportId),
    ).resolves.toMatchObject({ reportHash: fixture.report.reportHash, status: "ready" });
  });

  it("freezes order and payment financial identities independently of mutable lifecycle fields", async () => {
    const order = await capturedOrder();
    for (const column of [
      "id",
      "principal_id",
      "report_intent_id",
      "subject_id",
      "product_version",
      "payable",
      "amount_paise",
      "currency",
      "receipt",
      "created_at",
    ]) {
      await expect(
        pool.query(`UPDATE orders SET ${column} = ${column} WHERE id = $1`, [order.orderId]),
        column,
      ).rejects.toMatchObject({ code: "55000" });
    }
    for (const column of [
      "id",
      "order_id",
      "provider_payment_id",
      "provider_order_id",
      "amount_paise",
      "currency",
      "receipt",
      "created_at",
    ]) {
      await expect(
        pool.query(`UPDATE payments SET ${column} = ${column} WHERE id = $1`, [order.paymentId]),
        column,
      ).rejects.toMatchObject({ code: "55000" });
    }
    await expect(
      repository.findOrderForOwner(order.orderId, fixtureIds.principalId),
    ).resolves.toMatchObject({ amountPaise: 49_900, currency: "INR", status: "paid" });
  });

  it("keeps provider event evidence append-only and binds its allowlisted payload to its source", async () => {
    const order = await capturedOrder();
    await expect(
      pool.query("UPDATE payment_events SET outcome = 'duplicate' WHERE provider_event_id = $1", [
        order.eventId,
      ]),
    ).rejects.toMatchObject({ code: "55000" });
    await expect(
      pool.query("DELETE FROM payment_events WHERE provider_event_id = $1", [order.eventId]),
    ).rejects.toMatchObject({ code: "55000" });
    await expect(
      pool.query(
        `INSERT INTO payment_events
       SELECT (jsonb_populate_record(NULL::payment_events, to_jsonb(existing) ||
         jsonb_build_object('provider_event_id', $2::text, 'payload_json', '{"source":"checkout_proof"}'::jsonb))).*
       FROM payment_events AS existing WHERE provider_event_id = $1`,
        [order.eventId, `evt_${randomUUID()}`],
      ),
    ).rejects.toMatchObject({ code: "23514", constraint: "payment_events_payload_allowlist" });
  });

  it("binds outbox report, order, aggregate and payload while allowing delivery bookkeeping", async () => {
    const order = await capturedOrder();
    const insert = (reportId: string, aggregateId: string, payloadReportId: string) =>
      pool.query(
        `INSERT INTO outbox_events
       (id, order_id, report_id, event_type, schema_version, aggregate_type, aggregate_id, delivery_key, payload_json)
       VALUES ($1, $2, $3, 'report.generation.requested.v1', '1.0.0', 'report', $4, $5,
         jsonb_build_object('reportId', $6::text))`,
        [randomUUID(), fixtureIds.orderId, reportId, aggregateId, randomUUID(), payloadReportId],
      );
    await expect(insert(order.reportId, order.reportId, order.reportId)).rejects.toMatchObject({
      code: "23503",
      constraint: "outbox_events_report_order_fk",
    });
    await expect(
      insert(fixture.report.reportId, order.reportId, order.reportId),
    ).rejects.toMatchObject({ code: "23514", constraint: "outbox_events_aggregate_report_match" });
    await expect(
      insert(fixture.report.reportId, fixture.report.reportId, order.reportId),
    ).rejects.toMatchObject({ code: "23514", constraint: "outbox_events_payload_report_only" });
    for (const column of [
      "id",
      "order_id",
      "report_id",
      "event_type",
      "schema_version",
      "aggregate_type",
      "aggregate_id",
      "delivery_key",
      "payload_json",
      "created_at",
    ]) {
      await expect(
        pool.query(`UPDATE outbox_events SET ${column} = ${column} WHERE id = $1`, [
          order.outboxEventId,
        ]),
        column,
      ).rejects.toMatchObject({ code: "55000" });
    }
    await expect(
      pool.query(
        "UPDATE outbox_events SET attempt_count = attempt_count + 1, published_at = $2 WHERE id = $1",
        [order.outboxEventId, now],
      ),
    ).resolves.toMatchObject({ rowCount: 1 });
    await expect(repository.findFulfilment(order.orderId)).resolves.toMatchObject({
      reportId: order.reportId,
      outboxEventId: order.outboxEventId,
    });
  });

  it("freezes a refund request identity and permits only one full refund per order", async () => {
    const order = await capturedOrder();
    const request = {
      amountPaise: 49_900 as const,
      currency: "INR" as const,
      id: randomUUID(),
      idempotencyKey: randomUUID(),
      now,
      orderId: order.orderId,
      principalId: fixtureIds.principalId,
    };
    const refund = await repository.requestRefund(request);
    expect(refund).toMatchObject({ id: request.id, status: "requested" });
    for (const column of [
      "id",
      "principal_id",
      "order_id",
      "provider_payment_id",
      "idempotency_key",
      "amount_paise",
      "currency",
      "created_at",
    ]) {
      await expect(
        pool.query(`UPDATE refund_requests SET ${column} = ${column} WHERE id = $1`, [request.id]),
        column,
      ).rejects.toMatchObject({ code: "55000" });
    }
    await expect(
      repository.approveRefund({
        now,
        refundRequestId: request.id,
        approverId: fixtureIds.principalId,
      }),
    ).resolves.toMatchObject({ id: request.id, status: "approved" });
    await expect(
      repository.recordRefundResult({
        now,
        refundRequestId: request.id,
        providerRefundId: "rfnd_schema12345",
        status: "refunded",
      }),
    ).resolves.toMatchObject({ id: request.id, status: "refunded" });
    await expect(
      repository.requestRefund({ ...request, id: randomUUID(), idempotencyKey: randomUUID() }),
    ).resolves.toMatchObject({ id: request.id, status: "refunded" });
    await expect(
      pool.query(
        `INSERT INTO refund_requests
       SELECT (jsonb_populate_record(NULL::refund_requests, to_jsonb(existing) ||
         jsonb_build_object('id', $2::text, 'idempotency_key', $3::text,
           'status', 'requested', 'approved_by', NULL, 'approved_at', NULL, 'provider_refund_id', NULL))).*
       FROM refund_requests AS existing WHERE id = $1`,
        [request.id, randomUUID(), randomUUID()],
      ),
    ).rejects.toMatchObject({
      code: "23505",
      constraint: "refund_requests_one_full_refund_per_order",
    });
  });

  it("rejects a refund whose payment belongs to another order", async () => {
    const first = await capturedOrder();
    const second = await capturedOrder();
    await expect(
      pool.query(
        `INSERT INTO refund_requests
       (id, principal_id, order_id, provider_payment_id, idempotency_key, amount_paise, currency)
       VALUES ($1, $2, $3, $4, $5, 49900, 'INR')`,
        [
          randomUUID(),
          fixtureIds.principalId,
          second.orderId,
          first.providerPaymentId,
          randomUUID(),
        ],
      ),
    ).rejects.toMatchObject({ code: "23503", constraint: "refund_requests_payment_order_fk" });
  });
});
