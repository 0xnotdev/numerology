import { randomUUID } from "node:crypto";
import {
  type AdoptProviderOrderInput,
  PAYMENT_AMOUNT_PAISE,
  PAYMENT_CURRENCY,
  PAYMENT_OUTBOX_EVENT,
  PAYMENT_PRODUCT_VERSION,
  type PaymentOrderRecord,
  type PaymentRecord,
  type PaymentRefundRequest,
  type PaymentRepository,
  type PaymentSettlement,
  type PrepareCheckoutInput,
  type ProviderEventInput,
} from "@numerology/application";
import type { PoolClient } from "pg";
import type { DatabasePool } from "./pool";
import { createPostgresTransactionRunner } from "./transaction-runner";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const PROVIDER_ORDER = /^order_[A-Za-z0-9_-]{1,80}$/u;
const PROVIDER_PAYMENT = /^pay_[A-Za-z0-9_-]{1,80}$/u;
const HASH = /^[0-9a-f]{64}$/u;

function validDate(date: Date): boolean {
  return date instanceof Date && Number.isFinite(date.valueOf());
}

function toOrder(row: {
  amount_paise: number;
  currency: string;
  id: string;
  owner_principal_id: string;
  payable: boolean;
  payment_status: PaymentOrderRecord["status"];
  product_version: string;
  provider_order_id: string | null;
  receipt: string | null;
  report_id: string | null;
  report_intent_id: string;
}): PaymentOrderRecord {
  return {
    amountPaise: row.amount_paise,
    currency: row.currency,
    id: row.id,
    ownerPrincipalId: row.owner_principal_id,
    productVersion: row.product_version,
    ...(row.provider_order_id === null ? {} : { providerOrderId: row.provider_order_id }),
    receipt: row.receipt ?? "",
    ...(row.report_id === null ? {} : { reportId: row.report_id }),
    reportIntentId: row.report_intent_id,
    status: row.payment_status,
  };
}

function toPayment(row: {
  amount_paise: number;
  currency: string;
  id: string;
  order_id: string;
  provider_order_id: string;
  provider_payment_id: string;
  receipt: string | null;
  status: PaymentRecord["status"];
}): PaymentRecord {
  return {
    amountPaise: row.amount_paise,
    currency: row.currency,
    id: row.id,
    orderId: row.order_id,
    providerOrderId: row.provider_order_id,
    providerPaymentId: row.provider_payment_id,
    ...(row.receipt === null ? {} : { receipt: row.receipt }),
    status: row.status,
  };
}

function toRefund(row: {
  amount_paise: number;
  created_at: Date;
  currency: "INR";
  id: string;
  idempotency_key: string;
  order_id: string;
  principal_id: string;
  provider_payment_id: string;
  status: PaymentRefundRequest["status"];
  provider_refund_id?: string | null;
}): PaymentRefundRequest {
  return {
    amountPaise: row.amount_paise as typeof PAYMENT_AMOUNT_PAISE,
    createdAt: row.created_at,
    currency: row.currency,
    id: row.id,
    idempotencyKey: row.idempotency_key,
    orderId: row.order_id,
    principalId: row.principal_id,
    providerPaymentId: row.provider_payment_id,
    status: row.status,
    ...(typeof row.provider_refund_id === "string"
      ? { providerRefundId: row.provider_refund_id }
      : {}),
  };
}

function validatePreparation(input: PrepareCheckoutInput): void {
  if (
    !UUID.test(input.orderId) ||
    !UUID.test(input.ownerPrincipalId) ||
    !UUID.test(input.reportIntentId) ||
    input.amountPaise !== PAYMENT_AMOUNT_PAISE ||
    input.currency !== PAYMENT_CURRENCY ||
    input.productVersion !== PAYMENT_PRODUCT_VERSION ||
    !UUID.test(input.receipt) ||
    input.receipt !== input.orderId ||
    input.receipt.length > 40 ||
    !validDate(input.now)
  ) {
    throw new RangeError("PAYMENT_CHECKOUT_INPUT_INVALID");
  }
}

function validateAdoption(input: AdoptProviderOrderInput): void {
  if (
    !UUID.test(input.orderId) ||
    input.amountPaise !== PAYMENT_AMOUNT_PAISE ||
    input.currency !== PAYMENT_CURRENCY ||
    !PROVIDER_ORDER.test(input.providerOrderId) ||
    !UUID.test(input.receipt) ||
    input.receipt.length > 40 ||
    !validDate(input.now)
  ) {
    throw new RangeError("PAYMENT_PROVIDER_ORDER_INPUT_INVALID");
  }
}

function validateProviderEvent(input: ProviderEventInput): void {
  if (
    input.eventId.length < 1 ||
    input.eventId.length > 128 ||
    !PROVIDER_ORDER.test(input.providerOrderId) ||
    !PROVIDER_PAYMENT.test(input.payment.id) ||
    input.payment.orderId !== input.providerOrderId ||
    !HASH.test(input.rawBodyHash) ||
    input.amountPaise !== input.payment.amountPaise ||
    input.currency !== input.payment.currency ||
    input.eventType !== `payment.${input.payment.status}` ||
    !["payment.authorized", "payment.captured", "payment.failed"].includes(input.eventType) ||
    !validDate(input.occurredAt) ||
    (input.receipt !== undefined && (!UUID.test(input.receipt) || input.receipt.length > 40))
  ) {
    throw new RangeError("PAYMENT_EVENT_INPUT_INVALID");
  }
}

const ORDER_SELECT = `
  SELECT o.id, o.principal_id AS owner_principal_id, o.report_intent_id, o.product_version,
         o.amount_paise, o.currency, o.payable, o.status AS payment_status, o.provider_order_id,
         o.receipt, r.id AS report_id
    FROM orders AS o
    LEFT JOIN LATERAL (
      SELECT id FROM reports
       WHERE order_id = o.id AND status <> 'deleted'
       ORDER BY CASE WHEN status = 'pending' THEN 0 ELSE 1 END,
                ready_at DESC NULLS LAST, id ASC
       LIMIT 1
    ) AS r ON true
`;

async function selectOrder(
  client: Pick<PoolClient, "query">,
  orderId: string,
  lock = false,
): Promise<PaymentOrderRecord | null> {
  const result = await client.query<Parameters<typeof toOrder>[0]>(
    `${ORDER_SELECT} WHERE o.id = $1${lock ? " FOR UPDATE OF o" : ""}`,
    [orderId],
  );
  const row = result.rows[0];
  return row === undefined ? null : toOrder(row);
}

export function createPostgresPaymentRepository(pool: DatabasePool): PaymentRepository {
  const transactions = createPostgresTransactionRunner(pool);

  return {
    async confirmFailedOrder(input) {
      if (
        !UUID.test(input.orderId) ||
        !PROVIDER_ORDER.test(input.providerOrderId) ||
        !validDate(input.now)
      )
        throw new RangeError("PAYMENT_ORDER_INPUT_INVALID");
      return transactions.run(async (client) => {
        await client.query(
          `SELECT ri.id FROM report_intents ri JOIN orders o ON o.report_intent_id = ri.id
             WHERE o.id = $1 FOR UPDATE OF ri`,
          [input.orderId],
        );
        const order = await selectOrder(client, input.orderId, true);
        if (order === null || order.providerOrderId !== input.providerOrderId)
          throw new Error("PAYMENT_ORDER_NOT_FOUND");
        await client.query(
          `UPDATE orders SET status = 'failed', updated_at = $2, version = version + 1
             WHERE id = $1 AND status IN ('pending', 'ambiguous', 'failed')
               AND EXISTS (SELECT 1 FROM payments WHERE order_id = $1 AND status = 'failed')
               AND NOT EXISTS (SELECT 1 FROM payments WHERE order_id = $1
                                AND status IN ('created', 'authorized', 'captured', 'refunded'))`,
          [input.orderId, input.now],
        );
        const confirmed = await selectOrder(client, input.orderId);
        if (confirmed === null) throw new Error("PAYMENT_ORDER_NOT_FOUND");
        return confirmed;
      });
    },
    async confirmUnattemptedOrder(input) {
      if (
        !UUID.test(input.orderId) ||
        !PROVIDER_ORDER.test(input.providerOrderId) ||
        !validDate(input.now)
      )
        throw new RangeError("PAYMENT_ORDER_INPUT_INVALID");
      return transactions.run(async (client) => {
        const order = await selectOrder(client, input.orderId, true);
        if (order === null || order.providerOrderId !== input.providerOrderId)
          throw new Error("PAYMENT_ORDER_NOT_FOUND");
        const updated = await client.query(
          `UPDATE orders SET status = 'pending', updated_at = $2, version = version + 1
          WHERE id = $1 AND status IN ('pending', 'ambiguous', 'failed')
            AND NOT EXISTS (SELECT 1 FROM payments WHERE order_id = $1)
            AND EXISTS (SELECT 1 FROM report_intents ri WHERE ri.id = orders.report_intent_id AND ri.expires_at > $2)`,
          [input.orderId, input.now],
        );
        const confirmed = await selectOrder(client, input.orderId);
        if (confirmed === null) throw new Error("PAYMENT_ORDER_NOT_FOUND");
        return { confirmed: updated.rowCount === 1, order: confirmed };
      });
    },
    async prepareCheckout(input) {
      validatePreparation(input);
      return transactions.run(async (client) => {
        const intent = await client.query<{
          expires_at: Date;
          owner_principal_id: string;
          status: string;
          subject_id: string | null;
        }>(
          `SELECT owner_principal_id, status, subject_id, expires_at
             FROM report_intents WHERE id = $1 AND owner_principal_id = $2 FOR UPDATE`,
          [input.reportIntentId, input.ownerPrincipalId],
        );
        const intentRow = intent.rows[0];
        if (
          intentRow === undefined ||
          !["complete", "preview_ready", "checkout_created", "converted"].includes(
            intentRow.status,
          ) ||
          intentRow.subject_id === null
        ) {
          throw new Error("PAYMENT_CHECKOUT_NOT_AVAILABLE");
        }
        const existing = await client.query<Parameters<typeof toOrder>[0]>(
          `${ORDER_SELECT} WHERE o.report_intent_id = $1 FOR UPDATE OF o`,
          [input.reportIntentId],
        );
        const existingRow = existing.rows[0];
        if (existingRow !== undefined) {
          if (existingRow.owner_principal_id !== input.ownerPrincipalId) {
            throw new Error("PAYMENT_ORDER_CONFLICT");
          }
          if (existingRow.amount_paise !== PAYMENT_AMOUNT_PAISE || existingRow.payable !== true) {
            throw new Error("PAYMENT_ORDER_CONFLICT");
          }
          if (
            intentRow.expires_at <= input.now &&
            ["pending", "failed"].includes(existingRow.payment_status)
          ) {
            await client.query(
              `UPDATE orders SET status = 'expired', updated_at = $2, version = version + 1 WHERE id = $1`,
              [existingRow.id, input.now],
            );
            return { ...toOrder(existingRow), status: "expired" };
          }
          return toOrder(existingRow);
        }
        if (
          intentRow.expires_at <= input.now ||
          !["complete", "preview_ready"].includes(intentRow.status)
        ) {
          throw new Error("PAYMENT_CHECKOUT_NOT_AVAILABLE");
        }
        await client.query(
          `UPDATE report_intents SET status = 'checkout_created', updated_at = $2, version = version + 1
             WHERE id = $1 AND status IN ('complete', 'preview_ready')`,
          [input.reportIntentId, input.now],
        );
        await client.query(
          `INSERT INTO orders
             (id, principal_id, report_intent_id, subject_id, status, product_version,
              payable, amount_paise, currency, receipt, created_at, updated_at)
           VALUES ($1, $2, $3, $4, 'pending', $5, true, $6, $7, $8, $9, $9)`,
          [
            input.orderId,
            input.ownerPrincipalId,
            input.reportIntentId,
            intentRow.subject_id,
            input.productVersion,
            input.amountPaise,
            input.currency,
            input.receipt,
            input.now,
          ],
        );
        await audit(
          client,
          "payment.order_prepared",
          "order",
          input.orderId,
          input.now,
          "principal",
          input.ownerPrincipalId,
        );
        const created = await selectOrder(client, input.orderId);
        if (created === null) throw new Error("PAYMENT_ORDER_CREATE_FAILED");
        return created;
      });
    },

    async adoptProviderOrder(input) {
      validateAdoption(input);
      return transactions.run(async (client) => {
        const result = await client.query<Parameters<typeof toOrder>[0]>(
          `${ORDER_SELECT} WHERE o.id = $1 FOR UPDATE OF o`,
          [input.orderId],
        );
        const row = result.rows[0];
        if (
          row === undefined ||
          !row.payable ||
          row.amount_paise !== PAYMENT_AMOUNT_PAISE ||
          row.currency !== PAYMENT_CURRENCY
        ) {
          throw new Error("PAYMENT_ORDER_NOT_FOUND");
        }
        if (row.receipt !== input.receipt) throw new Error("PAYMENT_PROVIDER_ORDER_CONFLICT");
        if (row.provider_order_id !== null) {
          if (row.provider_order_id !== input.providerOrderId || row.receipt !== input.receipt) {
            throw new Error("PAYMENT_PROVIDER_ORDER_CONFLICT");
          }
          return toOrder(row);
        }
        await client.query(
          `UPDATE orders SET provider_order_id = $2, updated_at = $3, version = version + 1
             WHERE id = $1 AND provider_order_id IS NULL`,
          [input.orderId, input.providerOrderId, input.now],
        );
        const adopted = await selectOrder(client, input.orderId);
        if (adopted === null) throw new Error("PAYMENT_ORDER_ADOPTION_FAILED");
        return adopted;
      });
    },

    async findOrderForOwner(orderId, ownerPrincipalId) {
      if (!UUID.test(orderId) || !UUID.test(ownerPrincipalId)) return null;
      const result = await pool.query<Parameters<typeof toOrder>[0]>(
        `${ORDER_SELECT} WHERE o.id = $1 AND o.principal_id = $2 AND o.payable = true`,
        [orderId, ownerPrincipalId],
      );
      return result.rows[0] === undefined ? null : toOrder(result.rows[0]);
    },

    async findFulfilment(orderId) {
      if (!UUID.test(orderId)) return null;
      const result = await pool.query<{
        report_id: string;
        entitlement_id: string;
        outbox_event_id: string;
      }>(
        `SELECT r.id AS report_id, e.id AS entitlement_id, x.id AS outbox_event_id
           FROM outbox_events x JOIN reports r ON r.id = x.report_id AND r.order_id = x.order_id
           JOIN entitlements e ON e.report_id = r.id AND e.source_order_id = x.order_id
           WHERE x.order_id = $1`,
        [orderId],
      );
      const row = result.rows[0];
      return row === undefined
        ? null
        : {
            reportId: row.report_id,
            entitlementId: row.entitlement_id,
            outboxEventId: row.outbox_event_id,
          };
    },

    async findOrder(orderId) {
      if (!UUID.test(orderId)) return null;
      return selectOrder(pool, orderId);
    },

    async markOrderAmbiguous(input) {
      if (!UUID.test(input.orderId) || !validDate(input.now))
        throw new RangeError("PAYMENT_ORDER_INPUT_INVALID");
      await pool.query(
        `UPDATE orders SET status = 'ambiguous', updated_at = $2, version = version + 1
           WHERE id = $1 AND status IN ('pending', 'ambiguous', 'failed')`,
        [input.orderId, input.now],
      );
      const order = await selectOrder(pool, input.orderId);
      if (order === null) throw new Error("PAYMENT_ORDER_NOT_FOUND");
      return order;
    },

    async recordProviderEvent(input) {
      validateProviderEvent(input);
      return transactions.run(async (client) => {
        const eventInsert = await client.query(
          `INSERT INTO payment_events
             (provider_event_id, event_type, provider_order_id, provider_payment_id,
              payload_json, outcome, raw_body_hash, source, received_at)
           VALUES ($1, $2, $3, $4, $5::jsonb, 'accepted', $6, $7, $8)
           ON CONFLICT (provider_event_id) DO NOTHING`,
          [
            input.eventId,
            input.eventType,
            input.providerOrderId,
            input.payment.id,
            JSON.stringify({ source: input.source }),
            input.rawBodyHash,
            input.source,
            input.occurredAt,
          ],
        );
        // Use the same intent→order lock order as checkout preparation.
        await client.query(
          `SELECT id FROM report_intents WHERE id = (
          SELECT report_intent_id FROM orders WHERE provider_order_id = $1
        ) FOR UPDATE`,
          [input.providerOrderId],
        );
        const order = await selectOrderByProvider(client, input.providerOrderId, true);
        if (eventInsert.rowCount === 0) {
          const prior = await client.query<{
            raw_body_hash: string;
            source: string;
            event_type: string;
            provider_order_id: string;
            provider_payment_id: string;
          }>(
            `SELECT raw_body_hash, source, event_type, provider_order_id, provider_payment_id
               FROM payment_events WHERE provider_event_id = $1`,
            [input.eventId],
          );
          const event = prior.rows[0];
          if (
            event?.raw_body_hash !== input.rawBodyHash ||
            event.source !== input.source ||
            event.event_type !== input.eventType ||
            event.provider_order_id !== input.providerOrderId ||
            event.provider_payment_id !== input.payment.id
          )
            throw new Error("PAYMENT_EVENT_CONFLICT");
        }
        if (
          order === null ||
          order.amountPaise !== PAYMENT_AMOUNT_PAISE ||
          order.currency !== PAYMENT_CURRENCY
        ) {
          throw new Error("PAYMENT_PROVIDER_ORDER_NOT_FOUND");
        }
        if (
          order.providerOrderId !== input.providerOrderId ||
          order.receipt === "" ||
          (input.receipt !== undefined && input.receipt !== order.receipt) ||
          (input.payment.receipt !== undefined && input.payment.receipt !== order.receipt) ||
          input.payment.amountPaise !== PAYMENT_AMOUNT_PAISE ||
          input.payment.currency !== PAYMENT_CURRENCY
        ) {
          throw new Error("PAYMENT_PROVIDER_MISMATCH");
        }
        const existing = await client.query<{
          amount_paise: number;
          currency: string;
          id: string;
          order_id: string;
          provider_order_id: string;
          provider_payment_id: string;
          receipt: string | null;
          status: PaymentRecord["status"];
        }>(
          `SELECT id, order_id, provider_payment_id, provider_order_id, status,
                  amount_paise, currency, receipt
             FROM payments WHERE provider_payment_id = $1 FOR UPDATE`,
          [input.payment.id],
        );
        const incomingStatus =
          input.eventType === "payment.captured"
            ? "captured"
            : input.eventType === "payment.authorized"
              ? "authorized"
              : "failed";
        let payment: PaymentRecord;
        const current = existing.rows[0];
        if (
          current !== undefined &&
          (current.order_id !== order.id ||
            current.amount_paise !== input.amountPaise ||
            current.currency !== input.currency ||
            current.provider_order_id !== input.providerOrderId)
        )
          throw new Error("PAYMENT_ID_CONFLICT");
        if (current === undefined) {
          const inserted = await client.query<Parameters<typeof toPayment>[0]>(
            `INSERT INTO payments
               (id, order_id, provider_payment_id, provider_order_id, status,
                amount_paise, currency, receipt, captured_at, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
             RETURNING id, order_id, provider_payment_id, provider_order_id, status,
                       amount_paise, currency, receipt`,
            [
              randomUUID(),
              order.id,
              input.payment.id,
              input.providerOrderId,
              incomingStatus,
              input.payment.amountPaise,
              input.payment.currency,
              input.receipt ?? null,
              incomingStatus === "captured" ? input.occurredAt : null,
              input.occurredAt,
            ],
          );
          const insertedRow = inserted.rows[0];
          if (insertedRow === undefined) throw new Error("PAYMENT_CREATE_FAILED");
          payment = toPayment(insertedRow);
        } else {
          const rank = { created: 0, authorized: 1, failed: 2, captured: 3, refunded: 4 } as const;
          const nextStatus =
            rank[incomingStatus] > rank[current.status] ? incomingStatus : current.status;
          if (nextStatus !== current.status) {
            const updated = await client.query<Parameters<typeof toPayment>[0]>(
              `UPDATE payments SET status = $2::payment_status, captured_at = CASE WHEN $2::payment_status IN ('captured', 'refunded') THEN COALESCE(captured_at, $3) ELSE captured_at END,
                                      updated_at = $3
                 WHERE id = $1
               RETURNING id, order_id, provider_payment_id, provider_order_id, status,
                         amount_paise, currency, receipt`,
              [current.id, nextStatus, input.occurredAt],
            );
            const updatedRow = updated.rows[0];
            if (updatedRow === undefined) throw new Error("PAYMENT_UPDATE_FAILED");
            payment = toPayment(updatedRow);
          } else {
            payment = toPayment(current);
          }
        }

        const exactCapture =
          payment.status === "captured" &&
          payment.amountPaise === PAYMENT_AMOUNT_PAISE &&
          payment.currency === PAYMENT_CURRENCY &&
          payment.providerOrderId === order.providerOrderId;
        if (exactCapture && order.status !== "paid" && order.status !== "refunded") {
          const report = await client.query<{ id: string }>(
            `SELECT id FROM reports WHERE order_id = $1 AND status <> 'deleted'
              ORDER BY CASE WHEN status = 'pending' THEN 0 ELSE 1 END,
                       ready_at DESC NULLS LAST, id ASC
              LIMIT 1 FOR UPDATE`,
            [order.id],
          );
          let reportId = report.rows[0]?.id;
          if (reportId === undefined) {
            const reportInserted = await client.query<{ id: string }>(
              `INSERT INTO reports
                 (id, order_id, subject_id, report_version, status, locale,
                  purge_after, created_at, updated_at)
               SELECT $1, o.id, o.subject_id, 1, 'pending', ri.locale,
                      $2, $3, $3
                 FROM orders AS o JOIN report_intents AS ri ON ri.id = o.report_intent_id
                WHERE o.id = $4
               RETURNING id`,
              [
                randomUUID(),
                new Date(input.occurredAt.getTime() + 30 * 86_400_000),
                input.occurredAt,
                order.id,
              ],
            );
            reportId = reportInserted.rows[0]?.id;
          }
          if (reportId === undefined) throw new Error("PAYMENT_PENDING_REPORT_FAILED");
          await client.query(
            `INSERT INTO entitlements
               (id, principal_id, report_id, source_order_id, actions, granted_at, created_at)
             SELECT $1, o.principal_id, $2, o.id, ARRAY['view']::text[], $3, $3
               FROM orders AS o WHERE o.id = $4
             ON CONFLICT (principal_id, report_id) DO NOTHING`,
            [randomUUID(), reportId, input.occurredAt, order.id],
          );
          await client.query(
            `INSERT INTO outbox_events
               (id, order_id, report_id, event_type, schema_version,
                aggregate_type, aggregate_id, delivery_key, payload_json, created_at)
             VALUES ($1, $2, $3, $4, '1.0.0', 'report', $7, $5, $8::jsonb, $6)
             ON CONFLICT (order_id, event_type) DO NOTHING`,
            [
              randomUUID(),
              order.id,
              reportId,
              PAYMENT_OUTBOX_EVENT,
              `report-generation:${order.id}`,
              input.occurredAt,
              reportId,
              JSON.stringify({ reportId }),
            ],
          );
          await client.query(
            `UPDATE orders SET status = 'paid', updated_at = $2, version = version + 1
               WHERE id = $1 AND status NOT IN ('paid', 'refunded')`,
            [order.id, input.occurredAt],
          );
          await audit(client, "payment.capture_fulfilled", "order", order.id, input.occurredAt);
          await client.query(
            `UPDATE report_intents SET status = 'converted', updated_at = $2, version = version + 1
               WHERE id = $1 AND status IN ('checkout_created', 'complete')`,
            [order.reportIntentId, input.occurredAt],
          );
        } else if (
          (payment.status === "failed" || payment.status === "authorized") &&
          order.status !== "paid" &&
          order.status !== "refunded"
        ) {
          await client.query(
            `UPDATE orders SET status = CASE WHEN status = 'ambiguous' OR EXISTS (
                 SELECT 1 FROM payments WHERE order_id = $1 AND status = 'authorized'
               ) THEN 'ambiguous'::fixture_order_status ELSE 'failed'::fixture_order_status END,
               updated_at = $2, version = version + 1
               WHERE id = $1 AND status IN ('pending', 'ambiguous', 'failed')`,
            [order.id, input.occurredAt],
          );
        }
        const finalOrder = await selectOrder(client, order.id);
        if (finalOrder === null) throw new Error("PAYMENT_ORDER_NOT_FOUND");
        return {
          deduplicated: eventInsert.rowCount === 0,
          fulfilled: finalOrder.status === "paid" || finalOrder.status === "refunded",
          order: finalOrder,
          payment,
        } satisfies PaymentSettlement;
      });
    },

    async requestRefund(input) {
      if (
        !UUID.test(input.id) ||
        !UUID.test(input.idempotencyKey) ||
        !UUID.test(input.orderId) ||
        !UUID.test(input.principalId) ||
        input.amountPaise !== PAYMENT_AMOUNT_PAISE ||
        input.currency !== PAYMENT_CURRENCY ||
        !validDate(input.now)
      )
        throw new RangeError("PAYMENT_REFUND_INPUT_INVALID");
      return transactions.run(async (client) => {
        const order = await selectOrder(client, input.orderId, true);
        if (order === null || order.ownerPrincipalId !== input.principalId) return null;
        const prior = await client.query<Parameters<typeof toRefund>[0]>(
          `SELECT * FROM refund_requests WHERE order_id = $1 AND principal_id = $2`,
          [input.orderId, input.principalId],
        );
        if (prior.rows[0] !== undefined) return toRefund(prior.rows[0]);
        if (order.status !== "paid") return null;
        const payment = await client.query<{ provider_payment_id: string }>(
          `SELECT provider_payment_id FROM payments WHERE order_id = $1 AND status = 'captured' ORDER BY created_at DESC LIMIT 1`,
          [input.orderId],
        );
        const providerPaymentId = payment.rows[0]?.provider_payment_id;
        if (providerPaymentId === undefined) return null;
        const inserted = await client.query<Parameters<typeof toRefund>[0]>(
          `INSERT INTO refund_requests
             (id, principal_id, order_id, provider_payment_id, idempotency_key,
              amount_paise, currency, status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'requested', $8, $8)
           ON CONFLICT (principal_id, order_id, idempotency_key) DO NOTHING
           RETURNING id, principal_id, order_id, provider_payment_id,
                     idempotency_key, amount_paise, currency, status, created_at, provider_refund_id`,
          [
            input.id,
            input.principalId,
            input.orderId,
            providerPaymentId,
            input.idempotencyKey,
            input.amountPaise,
            input.currency,
            input.now,
          ],
        );
        if (inserted.rows[0] !== undefined) {
          await audit(
            client,
            "payment.refund_requested",
            "refund_request",
            input.id,
            input.now,
            "principal",
            input.principalId,
          );
          return toRefund(inserted.rows[0]);
        }
        const existing = await client.query<Parameters<typeof toRefund>[0]>(
          `SELECT id, principal_id, order_id, provider_payment_id, idempotency_key,
                  amount_paise, currency, status, created_at, provider_refund_id
             FROM refund_requests
            WHERE principal_id = $1 AND order_id = $2 AND idempotency_key = $3`,
          [input.principalId, input.orderId, input.idempotencyKey],
        );
        return existing.rows[0] === undefined ? null : toRefund(existing.rows[0]);
      });
    },

    async findRefundRequest(refundRequestId) {
      if (!UUID.test(refundRequestId)) return null;
      const result = await pool.query<Parameters<typeof toRefund>[0]>(
        `SELECT id, principal_id, order_id, provider_payment_id, idempotency_key,
                amount_paise, currency, status, created_at, provider_refund_id
           FROM refund_requests WHERE id = $1`,
        [refundRequestId],
      );
      return result.rows[0] === undefined ? null : toRefund(result.rows[0]);
    },

    async approveRefund(input) {
      if (
        !UUID.test(input.refundRequestId) ||
        !UUID.test(input.approverId) ||
        !validDate(input.now)
      ) {
        throw new RangeError("PAYMENT_REFUND_APPROVAL_INVALID");
      }
      return transactions.run(async (client) => {
        const result = await client.query<Parameters<typeof toRefund>[0]>(
          `UPDATE refund_requests SET status = 'approved', approved_by = $2,
                                      approved_at = $3, updated_at = $3
             WHERE id = $1 AND status = 'requested'
           RETURNING id, principal_id, order_id, provider_payment_id,
                     idempotency_key, amount_paise, currency, status, created_at, provider_refund_id`,
          [input.refundRequestId, input.approverId, input.now],
        );
        if (result.rows[0] !== undefined) {
          await audit(
            client,
            "payment.refund_approved",
            "refund_request",
            input.refundRequestId,
            input.now,
            "support",
            input.approverId,
          );
          return toRefund(result.rows[0]);
        }
        const existing = await client.query<Parameters<typeof toRefund>[0]>(
          `SELECT id, principal_id, order_id, provider_payment_id, idempotency_key,
                  amount_paise, currency, status, created_at, provider_refund_id
             FROM refund_requests WHERE id = $1`,
          [input.refundRequestId],
        );
        return existing.rows[0] === undefined ? null : toRefund(existing.rows[0]);
      });
    },

    async recordRefundResult(input) {
      if (
        !UUID.test(input.refundRequestId) ||
        !/^rfnd_[A-Za-z0-9_-]{1,80}$/u.test(input.providerRefundId) ||
        !validDate(input.now)
      ) {
        throw new RangeError("PAYMENT_REFUND_RESULT_INVALID");
      }
      return transactions.run(async (client) => {
        // Capture locks order before payment; refund must use the same order to avoid deadlocks.
        const identity = await client.query<{ order_id: string }>(
          `SELECT order_id FROM refund_requests WHERE id = $1`,
          [input.refundRequestId],
        );
        if (identity.rows[0] === undefined) return null;
        await selectOrder(client, identity.rows[0].order_id, true);
        const existing = await client.query<
          Parameters<typeof toRefund>[0] & { provider_refund_id: string | null }
        >(`SELECT * FROM refund_requests WHERE id = $1 FOR UPDATE`, [input.refundRequestId]);
        const previous = existing.rows[0];
        if (previous === undefined) return null;
        if (
          previous.provider_refund_id !== null &&
          previous.provider_refund_id !== input.providerRefundId
        )
          throw new Error("PAYMENT_REFUND_CONFLICT");
        if (
          previous.status === "requested" ||
          previous.status === "refunded" ||
          previous.status === "failed"
        )
          return toRefund(previous);
        if (previous.status === input.status) return toRefund(previous);
        const result = await client.query<Parameters<typeof toRefund>[0]>(
          `UPDATE refund_requests SET status = $2, provider_refund_id = $3,
                                      updated_at = $4
             WHERE id = $1 AND status IN ('approved', 'submitted')
           RETURNING id, principal_id, order_id, provider_payment_id,
                     idempotency_key, amount_paise, currency, status, created_at, provider_refund_id`,
          [input.refundRequestId, input.status, input.providerRefundId, input.now],
        );
        const row = result.rows[0];
        if (row === undefined) return null;
        await audit(client, `payment.refund_${input.status}`, "refund_request", row.id, input.now);
        if (input.status === "refunded") {
          await client.query(
            `UPDATE payments SET status = 'refunded', updated_at = $2
               WHERE order_id = $1 AND provider_payment_id = $3`,
            [row.order_id, input.now, row.provider_payment_id],
          );
          await client.query(
            `UPDATE orders SET status = 'refunded', updated_at = $2, version = version + 1
               WHERE id = $1 AND status IN ('paid', 'refunded')`,
            [row.order_id, input.now],
          );
          await client.query(
            `UPDATE entitlements SET revoked_at = COALESCE(revoked_at, $2)
               WHERE source_order_id = $1`,
            [row.order_id, input.now],
          );
        }
        return toRefund(row);
      });
    },
  };
}

async function selectOrderByProvider(
  client: Pick<PoolClient, "query">,
  providerOrderId: string,
  lock: boolean,
): Promise<PaymentOrderRecord | null> {
  const result = await client.query<Parameters<typeof toOrder>[0]>(
    `${ORDER_SELECT} WHERE o.provider_order_id = $1${lock ? " FOR UPDATE OF o" : ""}`,
    [providerOrderId],
  );
  const row = result.rows[0];
  return row === undefined ? null : toOrder(row);
}

export const createPaymentRepository = createPostgresPaymentRepository;

async function audit(
  client: PoolClient,
  action: string,
  targetType: string,
  targetId: string,
  now: Date,
  actorType: "system" | "principal" | "support" = "system",
  principalId?: string,
): Promise<void> {
  await client.query(
    `INSERT INTO audit_events
    (id, actor_type, actor_principal_id, action, target_type, target_id, correlation_id, safe_metadata, occurred_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,'{}'::jsonb,$8)`,
    [randomUUID(), actorType, principalId ?? null, action, targetType, targetId, targetId, now],
  );
}
