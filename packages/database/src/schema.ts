import { sql } from "drizzle-orm";
import {
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
