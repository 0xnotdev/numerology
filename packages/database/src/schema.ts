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
]);
export const consentAction = pgEnum("consent_action", ["granted", "withdrawn"]);
export const auditActorType = pgEnum("audit_actor_type", ["principal", "system", "support"]);
export const fixtureOrderStatus = pgEnum("fixture_order_status", ["fixture_ready"]);
export const reportStatus = pgEnum("report_status", ["ready", "superseded", "deleted"]);
export const jobAttemptStage = pgEnum("job_attempt_stage", ["fixture_generation"]);
export const jobAttemptOutcome = pgEnum("job_attempt_outcome", ["succeeded", "failed"]);

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
    subjectId: uuid("subject_id").notNull(),
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
    check(
      "orders_checkpoint4_nonpayable",
      sql`${table.payable} = false AND ${table.amountPaise} = 0 AND ${table.currency} = 'INR'`,
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
    inputSnapshotCiphertext: bytea("input_snapshot_ciphertext").notNull(),
    calculationSnapshotCiphertext: bytea("calculation_snapshot_ciphertext").notNull(),
    evidenceSnapshotCiphertext: bytea("evidence_snapshot_ciphertext").notNull(),
    planSnapshotCiphertext: bytea("plan_snapshot_ciphertext").notNull(),
    structuredReportCiphertext: bytea("structured_report_ciphertext").notNull(),
    inputHash: text("input_hash").notNull(),
    planHash: text("plan_hash").notNull(),
    reportHash: text("report_hash").notNull(),
    verificationJson: jsonb("verification_json").$type<Record<string, unknown>>().notNull(),
    verificationRecordHash: text("verification_record_hash").notNull(),
    engineVersion: text("engine_version").notNull(),
    doctrineVersion: text("doctrine_version").notNull(),
    doctrineHash: text("doctrine_hash").notNull(),
    plannerVersion: text("planner_version").notNull(),
    reportSchemaVersion: text("report_schema_version").notNull(),
    writerVersion: text("writer_version").notNull(),
    localePackVersion: text("locale_pack_version").notNull(),
    safetyPolicyVersion: text("safety_policy_version").notNull(),
    verifierVersion: text("verifier_version").notNull(),
    rendererVersion: text("renderer_version").notNull(),
    readyAt: timestamp("ready_at", { mode: "date", withTimezone: true }).notNull(),
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
