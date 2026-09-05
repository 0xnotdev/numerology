import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

const createdAt = () =>
  timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow();

export const sharedRateLimits = pgTable(
  "shared_rate_limits",
  {
    key: text("key").primaryKey(),
    windowStartedAt: timestamp("window_started_at", { mode: "date", withTimezone: true }).notNull(),
    count: integer("count").notNull(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("shared_rate_limits_updated_idx").on(table.updatedAt),
    check("shared_rate_limits_count_positive", sql`${table.count} BETWEEN 1 AND 1000001`),
  ],
);

export const supportedLocale = pgEnum("supported_locale", ["en-IN", "hi-IN", "or-IN"]);
export const intentStatus = pgEnum("intent_status", [
  "draft",
  "complete",
  "preview_ready",
  "checkout_created",
  "abandoned",
  "converted",
  "expired",
]);
export const accessChallengePurpose = pgEnum("access_challenge_purpose", [
  "sign_in",
  "report_access",
  "reauthenticate",
]);
export const nameUseKind = pgEnum("name_use_kind", [
  "birth_full",
  "current_full",
  "popular",
  "report_display",
  "engine_latin",
]);
export const consentPurpose = pgEnum("consent_purpose", [
  "required_processing",
  "third_party_authority",
  "marketing_email",
  "analytics",
]);
export const consentAction = pgEnum("consent_action", ["granted", "declined", "withdrawn"]);
export const auditActorType = pgEnum("audit_actor_type", ["principal", "system", "support"]);
export const fixtureOrderStatus = pgEnum("fixture_order_status", [
  "fixture_ready",
  "pending",
  "ambiguous",
  "paid",
  "failed",
  "expired",
  "refunded",
]);
export const paymentStatus = pgEnum("payment_status", [
  "created",
  "authorized",
  "captured",
  "failed",
  "refunded",
]);
export const paymentEventType = pgEnum("payment_event_type", [
  "payment.authorized",
  "payment.captured",
  "payment.failed",
]);
export const refundRequestStatus = pgEnum("refund_request_status", [
  "requested",
  "approved",
  "submitted",
  "refunded",
  "failed",
]);
export const reportStatus = pgEnum("report_status", ["pending", "ready", "superseded", "deleted"]);
export const jobAttemptStage = pgEnum("job_attempt_stage", ["fixture_generation"]);
export const jobAttemptOutcome = pgEnum("job_attempt_outcome", ["succeeded", "failed"]);
export const prepaymentAnalyticsEventName = pgEnum("prepayment_analytics_event_name", [
  "landing_viewed",
  "intake_started",
  "intake_step_completed",
  "intake_reviewed",
  "preview_viewed",
]);

export const principals = pgTable(
  "principals",
  {
    id: uuid("id").primaryKey(),
    emailCiphertext: bytea("email_ciphertext").notNull(),
    emailLookupHmac: bytea("email_lookup_hmac").notNull(),
    emailKeyVersion: smallint("email_key_version").notNull(),
    locale: supportedLocale("locale").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    version: integer("version").notNull().default(1),
  },
  (table) => [
    unique("principals_email_lookup_hmac_unique").on(table.emailLookupHmac),
    check("principals_email_key_version_positive", sql`${table.emailKeyVersion} >= 1`),
    check("principals_version_positive", sql`${table.version} >= 1`),
  ],
);

export const reportIntentCreateRequests = pgTable(
  "report_intent_create_requests",
  {
    ownerPrincipalId: uuid("owner_principal_id")
      .notNull()
      .references(() => principals.id, { onDelete: "cascade" }),
    operation: varchar("operation", { length: 40 }).notNull(),
    key: uuid("key").notNull(),
    resourceId: uuid("resource_id").notNull(),
    requestFingerprint: varchar("request_fingerprint", { length: 64 }).notNull(),
    responseCiphertext: bytea("response_ciphertext").notNull(),
    expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    unique("report_intent_create_request_key").on(
      table.ownerPrincipalId,
      table.operation,
      table.key,
    ),
    unique("report_intent_create_request_resource").on(table.resourceId),
    check(
      "report_intent_create_request_operation",
      sql`${table.operation} = 'report-intents.create'`,
    ),
    check(
      "report_intent_create_request_fingerprint",
      sql`${table.requestFingerprint} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "report_intent_create_request_expiry",
      sql`${table.expiresAt} > ${table.createdAt} AND ${table.expiresAt} <= ${table.createdAt} + interval '24 hours'`,
    ),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey(),
    principalId: uuid("principal_id")
      .notNull()
      .references(() => principals.id, { onDelete: "cascade" }),
    tokenDigest: bytea("token_digest").notNull(),
    csrfDigest: bytea("csrf_digest").notNull(),
    lastSeenAt: timestamp("last_seen_at", { mode: "date", withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }).notNull(),
    absoluteExpiresAt: timestamp("absolute_expires_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    revokedAt: timestamp("revoked_at", { mode: "date", withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    unique("sessions_token_digest_unique").on(table.tokenDigest),
    index("sessions_active_principal_idx")
      .on(table.principalId, table.expiresAt)
      .where(sql`${table.revokedAt} IS NULL`),
    check("sessions_expiry_order", sql`${table.expiresAt} <= ${table.absoluteExpiresAt}`),
  ],
);

export const accessChallenges = pgTable(
  "access_challenges",
  {
    id: uuid("id").primaryKey(),
    emailLookupHmac: bytea("email_lookup_hmac").notNull(),
    principalId: uuid("principal_id").references(() => principals.id, { onDelete: "cascade" }),
    purpose: accessChallengePurpose("purpose").notNull(),
    tokenDigest: bytea("token_digest").notNull(),
    browserDigest: bytea("browser_digest"),
    pendingEmailCiphertext: bytea("pending_email_ciphertext"),
    pendingEmailKeyVersion: smallint("pending_email_key_version"),
    pendingLocale: supportedLocale("pending_locale"),
    attempts: smallint("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { mode: "date", withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    unique("access_challenges_token_digest_unique").on(table.tokenDigest),
    index("access_challenges_lookup_idx").on(table.emailLookupHmac, table.createdAt.desc()),
    uniqueIndex("access_challenges_one_active_idx")
      .on(table.emailLookupHmac, table.purpose)
      .where(sql`${table.consumedAt} IS NULL`),
    check("access_challenges_attempts_range", sql`${table.attempts} BETWEEN 0 AND 5`),
    check(
      "access_challenges_pending_sign_in_valid",
      sql`${table.pendingEmailCiphertext} IS NULL OR (
      ${table.purpose} = 'sign_in' AND ${table.browserDigest} IS NOT NULL
      AND octet_length(${table.browserDigest}) = 32 AND ${table.pendingEmailKeyVersion} IS NOT NULL
      AND ${table.pendingEmailKeyVersion} >= 1 AND ${table.pendingLocale} IS NOT NULL
      AND ${table.expiresAt} > ${table.createdAt} AND ${table.expiresAt} <= ${table.createdAt} + interval '10 minutes')`,
    ),
    index("access_challenges_sign_in_expiry_idx")
      .on(table.expiresAt)
      .where(sql`${table.purpose} = 'sign_in'`),
  ],
);

export const subjects = pgTable(
  "subjects",
  {
    id: uuid("id").primaryKey(),
    ownerPrincipalId: uuid("owner_principal_id")
      .notNull()
      .references(() => principals.id, { onDelete: "restrict" }),
    dateOfBirthCiphertext: bytea("date_of_birth_ciphertext").notNull(),
    identityKeyVersion: smallint("identity_key_version").notNull(),
    createdAt: createdAt(),
    purgeAfter: timestamp("purge_after", { mode: "date", withTimezone: true }).notNull(),
  },
  (table) => [
    unique("subjects_id_owner_unique").on(table.id, table.ownerPrincipalId),
    index("subjects_owner_idx").on(table.ownerPrincipalId, table.createdAt.desc()),
    check("subjects_identity_key_version_positive", sql`${table.identityKeyVersion} >= 1`),
    check("subjects_purge_after_created", sql`${table.purgeAfter} > ${table.createdAt}`),
  ],
);

export const nameUses = pgTable(
  "name_uses",
  {
    id: uuid("id").primaryKey(),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
    kind: nameUseKind("kind").notNull(),
    displayCiphertext: bytea("display_ciphertext").notNull(),
    normalizedCiphertext: bytea("normalized_ciphertext").notNull(),
    locale: varchar("locale", { length: 20 }),
    position: smallint("position").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    unique("name_uses_subject_kind_position_unique").on(
      table.subjectId,
      table.kind,
      table.position,
    ),
    check("name_uses_position_nonnegative", sql`${table.position} >= 0`),
  ],
);

export const reportIntents = pgTable(
  "report_intents",
  {
    id: uuid("id").primaryKey(),
    ownerPrincipalId: uuid("owner_principal_id")
      .notNull()
      .references(() => principals.id, { onDelete: "restrict" }),
    subjectId: uuid("subject_id"),
    status: intentStatus("status").notNull().default("draft"),
    locale: supportedLocale("locale").notNull(),
    inputSchemaVersion: text("input_schema_version").notNull(),
    draftCiphertext: bytea("draft_ciphertext").notNull(),
    inputSnapshotCiphertext: bytea("input_snapshot_ciphertext"),
    inputHash: bytea("input_hash"),
    noticeVersion: text("notice_version"),
    requiredConsentAt: timestamp("required_consent_at", {
      mode: "date",
      withTimezone: true,
    }),
    previewJson: jsonb("preview_json").$type<Record<string, unknown>>(),
    expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    version: integer("version").notNull().default(1),
  },
  (table) => [
    unique("report_intents_id_owner_unique").on(table.id, table.ownerPrincipalId),
    foreignKey({
      columns: [table.subjectId, table.ownerPrincipalId],
      foreignColumns: [subjects.id, subjects.ownerPrincipalId],
      name: "report_intents_subject_owner_fk",
    }).onDelete("restrict"),
    index("report_intents_owner_idx").on(table.ownerPrincipalId, table.createdAt.desc()),
    index("report_intents_expiry_idx")
      .on(table.expiresAt)
      .where(sql`${table.status} IN ('draft', 'complete', 'preview_ready')`),
    check("report_intents_version_positive", sql`${table.version} >= 1`),
    check(
      "report_intents_completed_has_subject",
      sql`${table.status} IN ('draft', 'abandoned', 'expired') OR ${table.subjectId} IS NOT NULL`,
    ),
    check("report_intents_expiry_after_created", sql`${table.expiresAt} > ${table.createdAt}`),
    check(
      "report_intents_snapshot_all_or_none",
      sql`(${table.inputSnapshotCiphertext} IS NULL) = (${table.inputHash} IS NULL)`,
    ),
    check(
      "report_intents_completed_has_snapshot",
      sql`${table.status} IN ('draft', 'abandoned', 'expired') OR
          (${table.inputSnapshotCiphertext} IS NOT NULL AND
           ${table.inputHash} IS NOT NULL AND
           ${table.noticeVersion} IS NOT NULL AND
           ${table.requiredConsentAt} IS NOT NULL)`,
    ),
  ],
);

export const fixtureOrders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey(),
    principalId: uuid("principal_id").notNull(),
    reportIntentId: uuid("report_intent_id").notNull(),
    subjectId: uuid("subject_id").notNull(),
    status: fixtureOrderStatus("status").notNull().default("fixture_ready"),
    productVersion: text("product_version").notNull(),
    payable: boolean("payable").notNull().default(false),
    amountPaise: integer("amount_paise").notNull().default(0),
    currency: varchar("currency", { length: 3 }).notNull().default("INR"),
    providerOrderId: text("provider_order_id"),
    receipt: varchar("receipt", { length: 40 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    version: integer("version").notNull().default(1),
  },
  (table) => [
    unique("orders_report_intent_unique").on(table.reportIntentId),
    unique("orders_id_subject_unique").on(table.id, table.subjectId),
    foreignKey({
      columns: [table.reportIntentId, table.principalId],
      foreignColumns: [reportIntents.id, reportIntents.ownerPrincipalId],
      name: "orders_intent_owner_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.subjectId, table.principalId],
      foreignColumns: [subjects.id, subjects.ownerPrincipalId],
      name: "orders_subject_owner_fk",
    }).onDelete("restrict"),
    index("orders_principal_created_idx").on(table.principalId, table.createdAt.desc()),
    uniqueIndex("orders_provider_order_unique")
      .on(table.providerOrderId)
      .where(sql`${table.providerOrderId} IS NOT NULL`),
    uniqueIndex("orders_receipt_unique").on(table.receipt).where(sql`${table.receipt} IS NOT NULL`),
    check(
      "orders_checkpoint4_nonpayable",
      sql`(${table.payable} = false AND ${table.amountPaise} = 0 AND ${table.currency} = 'INR' AND ${table.status} = 'fixture_ready') OR
        (${table.payable} = true AND ${table.amountPaise} = 49900 AND
         ${table.currency} = 'INR' AND ${table.productVersion} = 'personal-numerology-report-v1')`,
    ),
    check(
      "orders_provider_fields_shape",
      sql`(${table.payable} = false AND ${table.providerOrderId} IS NULL AND ${table.receipt} IS NULL) OR
        (${table.payable} = true AND ${table.receipt} IS NOT NULL AND ${table.receipt} = ${table.id}::text
          AND ${table.status} <> 'fixture_ready'
          AND (${table.providerOrderId} IS NULL OR ${table.providerOrderId} ~ '^order_[A-Za-z0-9_-]{1,80}$'))`,
    ),
    check(
      "orders_paid_requires_provider_order",
      sql`${table.status}::text NOT IN ('paid', 'refunded') OR
        (${table.payable} = true AND ${table.providerOrderId} IS NOT NULL AND ${table.receipt} IS NOT NULL)`,
    ),
    check("orders_version_positive", sql`${table.version} >= 1`),
  ],
);

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey(),
    orderId: uuid("order_id").notNull(),
    subjectId: uuid("subject_id").notNull(),
    reportVersion: integer("report_version").notNull(),
    status: reportStatus("status").notNull().default("ready"),
    locale: supportedLocale("locale").notNull(),
    inputSnapshotCiphertext: bytea("input_snapshot_ciphertext"),
    calculationSnapshotCiphertext: bytea("calculation_snapshot_ciphertext"),
    evidenceSnapshotCiphertext: bytea("evidence_snapshot_ciphertext"),
    planSnapshotCiphertext: bytea("plan_snapshot_ciphertext"),
    structuredReportCiphertext: bytea("structured_report_ciphertext"),
    inputHash: text("input_hash"),
    planHash: text("plan_hash"),
    reportHash: text("report_hash"),
    verificationJson: jsonb("verification_json").$type<Record<string, unknown>>(),
    verificationRecordHash: text("verification_record_hash"),
    engineVersion: text("engine_version"),
    doctrineVersion: text("doctrine_version"),
    doctrineHash: text("doctrine_hash"),
    plannerVersion: text("planner_version"),
    reportSchemaVersion: text("report_schema_version"),
    writerVersion: text("writer_version"),
    writerPolicyVersion: text("writer_policy_version"),
    localePackVersion: text("locale_pack_version"),
    safetyPolicyVersion: text("safety_policy_version"),
    verifierVersion: text("verifier_version"),
    rendererVersion: text("renderer_version"),
    readyAt: timestamp("ready_at", { mode: "date", withTimezone: true }),
    purgeAfter: timestamp("purge_after", { mode: "date", withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    version: integer("version").notNull().default(1),
  },
  (table) => [
    unique("reports_order_version_unique").on(table.orderId, table.reportVersion),
    unique("reports_id_order_unique").on(table.id, table.orderId),
    foreignKey({
      columns: [table.orderId, table.subjectId],
      foreignColumns: [fixtureOrders.id, fixtureOrders.subjectId],
      name: "reports_order_subject_fk",
    }).onDelete("restrict"),
    index("reports_order_ready_idx").on(table.orderId, table.readyAt.desc()),
    check("reports_report_version_positive", sql`${table.reportVersion} >= 1`),
    check("reports_row_version_positive", sql`${table.version} >= 1`),
    check("reports_ready_before_purge", sql`${table.purgeAfter} > ${table.readyAt}`),
    check(
      "reports_hashes_canonical",
      sql`${table.inputHash} ~ '^sha256:[0-9a-f]{64}$' AND ${table.planHash} ~ '^sha256:[0-9a-f]{64}$' AND ${table.reportHash} ~ '^sha256:[0-9a-f]{64}$' AND ${table.verificationRecordHash} ~ '^sha256:[0-9a-f]{64}$'`,
    ),
    check(
      "reports_generation_artifacts_shape",
      sql`(${table.status}::text = 'pending' AND
        ${table.inputSnapshotCiphertext} IS NULL AND
        ${table.calculationSnapshotCiphertext} IS NULL AND
        ${table.evidenceSnapshotCiphertext} IS NULL AND
        ${table.planSnapshotCiphertext} IS NULL AND
        ${table.structuredReportCiphertext} IS NULL AND
        ${table.inputHash} IS NULL AND ${table.planHash} IS NULL AND
        ${table.reportHash} IS NULL AND ${table.verificationJson} IS NULL AND
        ${table.verificationRecordHash} IS NULL AND ${table.engineVersion} IS NULL AND
        ${table.doctrineVersion} IS NULL AND ${table.doctrineHash} IS NULL AND
        ${table.plannerVersion} IS NULL AND ${table.reportSchemaVersion} IS NULL AND
        ${table.writerVersion} IS NULL AND ${table.writerPolicyVersion} IS NULL AND
        ${table.localePackVersion} IS NULL AND ${table.safetyPolicyVersion} IS NULL AND
        ${table.verifierVersion} IS NULL AND ${table.rendererVersion} IS NULL AND
        ${table.readyAt} IS NULL) OR
       (${table.status}::text <> 'pending' AND
        ${table.inputSnapshotCiphertext} IS NOT NULL AND
        ${table.calculationSnapshotCiphertext} IS NOT NULL AND
        ${table.evidenceSnapshotCiphertext} IS NOT NULL AND
        ${table.planSnapshotCiphertext} IS NOT NULL AND
        ${table.structuredReportCiphertext} IS NOT NULL AND
        ${table.inputHash} IS NOT NULL AND ${table.planHash} IS NOT NULL AND
        ${table.reportHash} IS NOT NULL AND ${table.verificationJson} IS NOT NULL AND
        ${table.verificationRecordHash} IS NOT NULL AND ${table.engineVersion} IS NOT NULL AND
        ${table.doctrineVersion} IS NOT NULL AND ${table.doctrineHash} IS NOT NULL AND
        ${table.plannerVersion} IS NOT NULL AND ${table.reportSchemaVersion} IS NOT NULL AND
        ${table.writerVersion} IS NOT NULL AND ${table.writerPolicyVersion} IS NOT NULL AND
        ${table.localePackVersion} IS NOT NULL AND ${table.safetyPolicyVersion} IS NOT NULL AND
        ${table.verifierVersion} IS NOT NULL AND ${table.rendererVersion} IS NOT NULL AND
        ${table.readyAt} IS NOT NULL)`,
    ),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => fixtureOrders.id, { onDelete: "restrict" }),
    providerPaymentId: text("provider_payment_id").notNull(),
    providerOrderId: text("provider_order_id").notNull(),
    status: paymentStatus("status").notNull(),
    amountPaise: integer("amount_paise").notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    receipt: varchar("receipt", { length: 40 }),
    capturedAt: timestamp("captured_at", { mode: "date", withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("payments_provider_payment_unique").on(table.providerPaymentId),
    unique("payments_order_provider_payment_unique").on(table.orderId, table.providerPaymentId),
    index("payments_order_idx").on(table.orderId, table.createdAt.desc()),
    check("payments_amount_positive", sql`${table.amountPaise} = 49900`),
    check("payments_currency_inr", sql`${table.currency} = 'INR'`),
    check(
      "payments_provider_ids_canonical",
      sql`${table.providerPaymentId} ~ '^pay_[A-Za-z0-9_-]{1,80}$' AND ${table.providerOrderId} ~ '^order_[A-Za-z0-9_-]{1,80}$'`,
    ),
    check(
      "payments_captured_at_shape",
      sql`(${table.status} IN ('captured', 'refunded')) = (${table.capturedAt} IS NOT NULL)`,
    ),
  ],
);

export const paymentEvents = pgTable(
  "payment_events",
  {
    providerEventId: text("provider_event_id").primaryKey(),
    eventType: paymentEventType("event_type").notNull(),
    providerOrderId: text("provider_order_id").notNull(),
    providerPaymentId: text("provider_payment_id"),
    payloadJson: jsonb("payload_json").$type<Record<string, unknown>>().notNull(),
    outcome: text("outcome").notNull(),
    rawBodyHash: text("raw_body_hash").notNull(),
    source: text("source").notNull(),
    receivedAt: timestamp("received_at", { mode: "date", withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("payment_events_order_idx").on(table.providerOrderId, table.receivedAt.desc()),
    check("payment_events_outcome_allowlist", sql`${table.outcome} IN ('accepted', 'duplicate')`),
    check(
      "payment_events_payload_allowlist",
      sql`${table.payloadJson} = jsonb_build_object('source', ${table.source})`,
    ),
    check("payment_events_raw_hash_canonical", sql`${table.rawBodyHash} ~ '^[0-9a-f]{64}$'`),
    check(
      "payment_events_source_allowlist",
      sql`${table.source} IN ('webhook', 'checkout_proof', 'reconciliation')`,
    ),
  ],
);

export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: uuid("id").primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => fixtureOrders.id, { onDelete: "restrict" }),
    reportId: uuid("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "restrict" }),
    eventType: text("event_type").notNull(),
    schemaVersion: text("schema_version").notNull(),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    deliveryKey: text("delivery_key").notNull(),
    payloadJson: jsonb("payload_json").$type<Record<string, unknown>>().notNull(),
    attemptCount: integer("attempt_count").notNull().default(0),
    createdAt: createdAt(),
    publishedAt: timestamp("published_at", { mode: "date", withTimezone: true }),
  },
  (table) => [
    unique("outbox_events_order_event_unique").on(table.orderId, table.eventType),
    unique("outbox_events_delivery_key_unique").on(table.deliveryKey),
    foreignKey({
      columns: [table.reportId, table.orderId],
      foreignColumns: [reports.id, reports.orderId],
      name: "outbox_events_report_order_fk",
    }).onDelete("restrict"),
    index("outbox_events_unpublished_idx")
      .on(table.createdAt)
      .where(sql`${table.publishedAt} IS NULL`),
    check("outbox_events_aggregate_report_match", sql`${table.aggregateId} = ${table.reportId}`),
    check("outbox_events_type_fixed", sql`${table.eventType} = 'report.generation.requested.v1'`),
    check("outbox_events_schema_version_fixed", sql`${table.schemaVersion} = '1.0.0'`),
    check("outbox_events_aggregate_type_fixed", sql`${table.aggregateType} = 'report'`),
    check(
      "outbox_events_payload_report_only",
      sql`${table.payloadJson} = jsonb_build_object('reportId', to_jsonb(${table.aggregateId}::text))`,
    ),
    check("outbox_events_attempt_nonnegative", sql`${table.attemptCount} >= 0`),
  ],
);

export const refundRequests = pgTable(
  "refund_requests",
  {
    id: uuid("id").primaryKey(),
    principalId: uuid("principal_id")
      .notNull()
      .references(() => principals.id, { onDelete: "restrict" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => fixtureOrders.id, { onDelete: "restrict" }),
    providerPaymentId: text("provider_payment_id").notNull(),
    idempotencyKey: uuid("idempotency_key").notNull(),
    amountPaise: integer("amount_paise").notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    status: refundRequestStatus("status").notNull().default("requested"),
    approvedBy: uuid("approved_by"),
    approvedAt: timestamp("approved_at", { mode: "date", withTimezone: true }),
    providerRefundId: text("provider_refund_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("refund_requests_principal_order_idempotency_unique").on(
      table.principalId,
      table.orderId,
      table.idempotencyKey,
    ),
    unique("refund_requests_one_full_refund_per_order").on(table.orderId),
    unique("refund_requests_provider_refund_unique").on(table.providerRefundId),
    foreignKey({
      columns: [table.orderId, table.providerPaymentId],
      foreignColumns: [payments.orderId, payments.providerPaymentId],
      name: "refund_requests_payment_order_fk",
    }).onDelete("restrict"),
    check(
      "refund_requests_provider_refund_canonical",
      sql`${table.providerRefundId} IS NULL OR ${table.providerRefundId} ~ '^rfnd_[A-Za-z0-9_-]{1,80}$'`,
    ),
    index("refund_requests_order_idx").on(table.orderId, table.createdAt.desc()),
    check("refund_requests_amount_exact", sql`${table.amountPaise} = 49900`),
    check("refund_requests_currency_inr", sql`${table.currency} = 'INR'`),
    check(
      "refund_requests_approval_shape",
      sql`(${table.status} = 'requested' AND ${table.approvedBy} IS NULL AND ${table.approvedAt} IS NULL AND ${table.providerRefundId} IS NULL) OR
        (${table.status} = 'approved' AND ${table.approvedBy} IS NOT NULL AND ${table.approvedAt} IS NOT NULL AND ${table.providerRefundId} IS NULL) OR
        (${table.status} IN ('submitted', 'refunded', 'failed') AND ${table.approvedBy} IS NOT NULL AND ${table.approvedAt} IS NOT NULL AND ${table.providerRefundId} IS NOT NULL)`,
    ),
  ],
);

export const privateRequestAction = pgEnum("private_request_action", [
  "correction",
  "export",
  "deletion",
]);
export const privateRequestStatus = pgEnum("private_request_status", [
  "requested",
  "processing",
  "completed",
  "failed",
]);

/** Durable request receipt. Fulfilment is intentionally outside this checkpoint. */
export const privateAccessRequests = pgTable(
  "private_access_requests",
  {
    id: uuid("id").primaryKey(),
    principalId: uuid("principal_id")
      .notNull()
      .references(() => principals.id, { onDelete: "restrict" }),
    reportId: uuid("report_id").notNull(),
    action: privateRequestAction("action").notNull(),
    idempotencyKey: uuid("idempotency_key").notNull(),
    requestFingerprint: text("request_fingerprint").notNull(),
    status: privateRequestStatus("status").notNull().default("requested"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("private_access_requests_idempotency_unique").on(
      table.principalId,
      table.reportId,
      table.idempotencyKey,
    ),
    foreignKey({
      columns: [table.reportId],
      foreignColumns: [reports.id],
      name: "private_access_requests_report_id_reports_id_fk",
    }).onDelete("restrict"),
    index("private_access_requests_principal_idx").on(table.principalId, table.createdAt.desc()),
    index("private_access_requests_report_idx").on(table.reportId, table.createdAt.desc()),
    check(
      "private_access_requests_fingerprint_canonical",
      sql`${table.requestFingerprint} ~ '^sha256:[0-9a-f]{64}$'`,
    ),
  ],
);

export const entitlements = pgTable(
  "entitlements",
  {
    id: uuid("id").primaryKey(),
    principalId: uuid("principal_id")
      .notNull()
      .references(() => principals.id, { onDelete: "restrict" }),
    reportId: uuid("report_id").notNull(),
    sourceOrderId: uuid("source_order_id").notNull(),
    actions: text("actions").array().notNull(),
    grantedAt: timestamp("granted_at", { mode: "date", withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { mode: "date", withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    unique("entitlements_principal_report_unique").on(table.principalId, table.reportId),
    foreignKey({
      columns: [table.reportId, table.sourceOrderId],
      foreignColumns: [reports.id, reports.orderId],
      name: "entitlements_report_order_fk",
    }).onDelete("restrict"),
    check("entitlements_actions_required", sql`cardinality(${table.actions}) > 0`),
  ],
);

export const jobAttempts = pgTable(
  "job_attempts",
  {
    id: uuid("id").primaryKey(),
    reportId: uuid("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "restrict" }),
    generationVersion: integer("generation_version").notNull(),
    stage: jobAttemptStage("stage").notNull(),
    outcome: jobAttemptOutcome("outcome").notNull(),
    diagnosticCodes: text("diagnostic_codes").array().notNull(),
    startedAt: timestamp("started_at", { mode: "date", withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { mode: "date", withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    unique("job_attempts_report_version_stage_unique").on(
      table.reportId,
      table.generationVersion,
      table.stage,
    ),
    index("job_attempts_report_idx").on(table.reportId, table.startedAt),
    check("job_attempts_generation_version_positive", sql`${table.generationVersion} >= 1`),
    check("job_attempts_time_order", sql`${table.finishedAt} >= ${table.startedAt}`),
  ],
);

export const consentEvents = pgTable(
  "consent_events",
  {
    id: uuid("id").primaryKey(),
    principalId: uuid("principal_id")
      .notNull()
      .references(() => principals.id, { onDelete: "restrict" }),
    reportIntentId: uuid("report_intent_id").references(() => reportIntents.id, {
      onDelete: "set null",
    }),
    purpose: consentPurpose("purpose").notNull(),
    action: consentAction("action").notNull(),
    noticeVersion: text("notice_version").notNull(),
    noticeLocale: supportedLocale("notice_locale").notNull(),
    occurredAt: timestamp("occurred_at", { mode: "date", withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("consent_events_principal_idx").on(table.principalId, table.occurredAt.desc()),
    index("consent_events_intent_idx").on(table.reportIntentId, table.occurredAt.desc()),
  ],
);

export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: uuid("id").primaryKey(),
    eventName: prepaymentAnalyticsEventName("event_name").notNull(),
    schemaVersion: varchar("schema_version", { length: 20 }).notNull(),
    sessionId: uuid("session_id").notNull(),
    properties: jsonb("properties").$type<Record<string, string | undefined>>().notNull(),
    occurredAt: timestamp("occurred_at", { mode: "date", withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("analytics_events_funnel_idx").on(table.eventName, table.occurredAt),
    index("analytics_events_expiry_idx").on(table.expiresAt),
    check("analytics_events_schema_version", sql`${table.schemaVersion} = '1.0.0'`),
    check(
      "analytics_events_retention_exact",
      sql`${table.expiresAt} = ${table.occurredAt} + interval '90 days'`,
    ),
    check(
      "analytics_events_properties_allowlist",
      sql`jsonb_typeof(${table.properties}) = 'object'
        AND ${table.properties} ? 'locale'
        AND (${table.properties}->>'locale') IN ('en-IN', 'hi-IN', 'or-IN')
        AND CASE ${table.eventName}
          WHEN 'landing_viewed' THEN ${table.properties} - ARRAY['campaign', 'deviceClass', 'locale', 'pageVersion'] = '{}'::jsonb
          WHEN 'intake_started' THEN ${table.properties} - ARRAY['experimentId', 'locale'] = '{}'::jsonb
          WHEN 'intake_step_completed' THEN ${table.properties} - ARRAY['elapsedBucket', 'locale', 'step'] = '{}'::jsonb
          WHEN 'intake_reviewed' THEN ${table.properties} - ARRAY['elapsedBucket', 'locale'] = '{}'::jsonb
          WHEN 'preview_viewed' THEN ${table.properties} - ARRAY['locale', 'previewVersion'] = '{}'::jsonb
          ELSE false
        END`,
    ),
  ],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey(),
    actorType: auditActorType("actor_type").notNull(),
    actorPrincipalId: uuid("actor_principal_id").references(() => principals.id, {
      onDelete: "set null",
    }),
    action: varchar("action", { length: 80 }).notNull(),
    targetType: varchar("target_type", { length: 40 }).notNull(),
    targetId: uuid("target_id").notNull(),
    reasonCode: varchar("reason_code", { length: 80 }),
    correlationId: varchar("correlation_id", { length: 64 }).notNull(),
    safeMetadata: jsonb("safe_metadata")
      .$type<Record<string, string | number | boolean | null>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    occurredAt: timestamp("occurred_at", { mode: "date", withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("audit_events_target_idx").on(table.targetType, table.targetId, table.occurredAt.desc()),
    index("audit_events_actor_idx").on(table.actorPrincipalId, table.occurredAt.desc()),
  ],
);
