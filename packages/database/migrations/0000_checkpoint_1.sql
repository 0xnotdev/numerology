CREATE TYPE "public"."access_challenge_purpose" AS ENUM('sign_in', 'report_access', 'reauthenticate');--> statement-breakpoint
CREATE TYPE "public"."audit_actor_type" AS ENUM('principal', 'system', 'support');--> statement-breakpoint
CREATE TYPE "public"."consent_action" AS ENUM('granted', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."consent_purpose" AS ENUM('required_processing', 'third_party_authority', 'marketing_email');--> statement-breakpoint
CREATE TYPE "public"."intent_status" AS ENUM('draft', 'complete', 'preview_ready', 'checkout_created', 'abandoned', 'converted', 'expired');--> statement-breakpoint
CREATE TYPE "public"."name_use_kind" AS ENUM('birth_full', 'current_full', 'popular', 'report_display', 'engine_latin');--> statement-breakpoint
CREATE TYPE "public"."supported_locale" AS ENUM('en-IN', 'hi-IN', 'or-IN');--> statement-breakpoint
CREATE TABLE "access_challenges" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email_lookup_hmac" "bytea" NOT NULL,
	"principal_id" uuid,
	"purpose" "access_challenge_purpose" NOT NULL,
	"token_digest" "bytea" NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_challenges_token_digest_unique" UNIQUE("token_digest"),
	CONSTRAINT "access_challenges_attempts_range" CHECK ("access_challenges"."attempts" BETWEEN 0 AND 5)
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_type" "audit_actor_type" NOT NULL,
	"actor_principal_id" uuid,
	"action" varchar(80) NOT NULL,
	"target_type" varchar(40) NOT NULL,
	"target_id" uuid NOT NULL,
	"reason_code" varchar(80),
	"correlation_id" varchar(64) NOT NULL,
	"safe_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consent_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"principal_id" uuid NOT NULL,
	"report_intent_id" uuid,
	"purpose" "consent_purpose" NOT NULL,
	"action" "consent_action" NOT NULL,
	"notice_version" text NOT NULL,
	"notice_locale" "supported_locale" NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "name_uses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"subject_id" uuid NOT NULL,
	"kind" "name_use_kind" NOT NULL,
	"display_ciphertext" "bytea" NOT NULL,
	"normalized_ciphertext" "bytea" NOT NULL,
	"locale" varchar(20),
	"position" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "name_uses_subject_kind_position_unique" UNIQUE("subject_id","kind","position"),
	CONSTRAINT "name_uses_position_nonnegative" CHECK ("name_uses"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "principals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email_ciphertext" "bytea" NOT NULL,
	"email_lookup_hmac" "bytea" NOT NULL,
	"email_key_version" smallint NOT NULL,
	"locale" "supported_locale" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "principals_email_lookup_hmac_unique" UNIQUE("email_lookup_hmac"),
	CONSTRAINT "principals_email_key_version_positive" CHECK ("principals"."email_key_version" >= 1),
	CONSTRAINT "principals_version_positive" CHECK ("principals"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "report_intents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_principal_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"status" "intent_status" DEFAULT 'draft' NOT NULL,
	"locale" "supported_locale" NOT NULL,
	"input_schema_version" text NOT NULL,
	"draft_ciphertext" "bytea" NOT NULL,
	"input_snapshot_ciphertext" "bytea",
	"input_hash" "bytea",
	"notice_version" text,
	"required_consent_at" timestamp with time zone,
	"preview_json" jsonb,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "report_intents_id_owner_unique" UNIQUE("id","owner_principal_id"),
	CONSTRAINT "report_intents_version_positive" CHECK ("report_intents"."version" >= 1),
	CONSTRAINT "report_intents_expiry_after_created" CHECK ("report_intents"."expires_at" > "report_intents"."created_at"),
	CONSTRAINT "report_intents_snapshot_all_or_none" CHECK (("report_intents"."input_snapshot_ciphertext" IS NULL) = ("report_intents"."input_hash" IS NULL)),
	CONSTRAINT "report_intents_completed_has_snapshot" CHECK ("report_intents"."status" IN ('draft', 'abandoned', 'expired') OR
          ("report_intents"."input_snapshot_ciphertext" IS NOT NULL AND
           "report_intents"."input_hash" IS NOT NULL AND
           "report_intents"."notice_version" IS NOT NULL AND
           "report_intents"."required_consent_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"principal_id" uuid NOT NULL,
	"token_digest" "bytea" NOT NULL,
	"csrf_digest" "bytea" NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"absolute_expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_digest_unique" UNIQUE("token_digest"),
	CONSTRAINT "sessions_expiry_order" CHECK ("sessions"."expires_at" <= "sessions"."absolute_expires_at")
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_principal_id" uuid NOT NULL,
	"date_of_birth_ciphertext" "bytea" NOT NULL,
	"identity_key_version" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"purge_after" timestamp with time zone NOT NULL,
	CONSTRAINT "subjects_id_owner_unique" UNIQUE("id","owner_principal_id"),
	CONSTRAINT "subjects_identity_key_version_positive" CHECK ("subjects"."identity_key_version" >= 1),
	CONSTRAINT "subjects_purge_after_created" CHECK ("subjects"."purge_after" > "subjects"."created_at")
);
--> statement-breakpoint
ALTER TABLE "access_challenges" ADD CONSTRAINT "access_challenges_principal_id_principals_id_fk" FOREIGN KEY ("principal_id") REFERENCES "public"."principals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_principal_id_principals_id_fk" FOREIGN KEY ("actor_principal_id") REFERENCES "public"."principals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_events" ADD CONSTRAINT "consent_events_principal_id_principals_id_fk" FOREIGN KEY ("principal_id") REFERENCES "public"."principals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_events" ADD CONSTRAINT "consent_events_report_intent_id_report_intents_id_fk" FOREIGN KEY ("report_intent_id") REFERENCES "public"."report_intents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "name_uses" ADD CONSTRAINT "name_uses_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_intents" ADD CONSTRAINT "report_intents_owner_principal_id_principals_id_fk" FOREIGN KEY ("owner_principal_id") REFERENCES "public"."principals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_intents" ADD CONSTRAINT "report_intents_subject_owner_fk" FOREIGN KEY ("subject_id","owner_principal_id") REFERENCES "public"."subjects"("id","owner_principal_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_principal_id_principals_id_fk" FOREIGN KEY ("principal_id") REFERENCES "public"."principals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_owner_principal_id_principals_id_fk" FOREIGN KEY ("owner_principal_id") REFERENCES "public"."principals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_challenges_lookup_idx" ON "access_challenges" USING btree ("email_lookup_hmac","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "access_challenges_one_active_idx" ON "access_challenges" USING btree ("email_lookup_hmac","purpose") WHERE "access_challenges"."consumed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "audit_events_target_idx" ON "audit_events" USING btree ("target_type","target_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_events_actor_idx" ON "audit_events" USING btree ("actor_principal_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "consent_events_principal_idx" ON "consent_events" USING btree ("principal_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "consent_events_intent_idx" ON "consent_events" USING btree ("report_intent_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "report_intents_owner_idx" ON "report_intents" USING btree ("owner_principal_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "report_intents_expiry_idx" ON "report_intents" USING btree ("expires_at") WHERE "report_intents"."status" IN ('draft', 'complete', 'preview_ready');--> statement-breakpoint
CREATE INDEX "sessions_active_principal_idx" ON "sessions" USING btree ("principal_id","expires_at") WHERE "sessions"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "subjects_owner_idx" ON "subjects" USING btree ("owner_principal_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE FUNCTION prevent_report_intent_snapshot_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.input_snapshot_ciphertext IS NOT NULL AND (
    NEW.input_snapshot_ciphertext IS DISTINCT FROM OLD.input_snapshot_ciphertext OR
    NEW.input_hash IS DISTINCT FROM OLD.input_hash OR
    NEW.notice_version IS DISTINCT FROM OLD.notice_version OR
    NEW.required_consent_at IS DISTINCT FROM OLD.required_consent_at
  ) THEN
    RAISE EXCEPTION 'completed report intent snapshots are immutable'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER report_intents_snapshot_immutable
BEFORE UPDATE OF input_snapshot_ciphertext, input_hash, notice_version, required_consent_at
ON report_intents
FOR EACH ROW
EXECUTE FUNCTION prevent_report_intent_snapshot_mutation();--> statement-breakpoint
CREATE FUNCTION reject_append_only_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'event records are append-only'
    USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint
CREATE TRIGGER audit_events_append_only
BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW
EXECUTE FUNCTION reject_append_only_event_mutation();--> statement-breakpoint
CREATE TRIGGER consent_events_append_only
BEFORE UPDATE OR DELETE ON consent_events
FOR EACH ROW
EXECUTE FUNCTION reject_append_only_event_mutation();
