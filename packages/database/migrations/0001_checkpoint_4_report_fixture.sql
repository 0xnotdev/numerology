CREATE TYPE "public"."fixture_order_status" AS ENUM('fixture_ready');--> statement-breakpoint
CREATE TYPE "public"."job_attempt_outcome" AS ENUM('succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."job_attempt_stage" AS ENUM('fixture_generation');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('ready', 'superseded', 'deleted');--> statement-breakpoint
CREATE TABLE "entitlements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"principal_id" uuid NOT NULL,
	"report_id" uuid NOT NULL,
	"source_order_id" uuid NOT NULL,
	"actions" text[] NOT NULL,
	"granted_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entitlements_principal_report_unique" UNIQUE("principal_id","report_id"),
	CONSTRAINT "entitlements_actions_required" CHECK (cardinality("entitlements"."actions") > 0)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"principal_id" uuid NOT NULL,
	"report_intent_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"status" "fixture_order_status" DEFAULT 'fixture_ready' NOT NULL,
	"product_version" text NOT NULL,
	"payable" boolean DEFAULT false NOT NULL,
	"amount_paise" integer DEFAULT 0 NOT NULL,
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "orders_report_intent_unique" UNIQUE("report_intent_id"),
	CONSTRAINT "orders_id_subject_unique" UNIQUE("id","subject_id"),
	CONSTRAINT "orders_checkpoint4_nonpayable" CHECK ("orders"."payable" = false AND "orders"."amount_paise" = 0 AND "orders"."currency" = 'INR'),
	CONSTRAINT "orders_version_positive" CHECK ("orders"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "job_attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"report_id" uuid NOT NULL,
	"generation_version" integer NOT NULL,
	"stage" "job_attempt_stage" NOT NULL,
	"outcome" "job_attempt_outcome" NOT NULL,
	"diagnostic_codes" text[] NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_attempts_report_version_stage_unique" UNIQUE("report_id","generation_version","stage"),
	CONSTRAINT "job_attempts_generation_version_positive" CHECK ("job_attempts"."generation_version" >= 1),
	CONSTRAINT "job_attempts_time_order" CHECK ("job_attempts"."finished_at" >= "job_attempts"."started_at")
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"report_version" integer NOT NULL,
	"status" "report_status" DEFAULT 'ready' NOT NULL,
	"locale" "supported_locale" NOT NULL,
	"input_snapshot_ciphertext" "bytea" NOT NULL,
	"calculation_snapshot_ciphertext" "bytea" NOT NULL,
	"evidence_snapshot_ciphertext" "bytea" NOT NULL,
	"plan_snapshot_ciphertext" "bytea" NOT NULL,
	"structured_report_ciphertext" "bytea" NOT NULL,
	"input_hash" text NOT NULL,
	"plan_hash" text NOT NULL,
	"report_hash" text NOT NULL,
	"verification_json" jsonb NOT NULL,
	"verification_record_hash" text NOT NULL,
	"engine_version" text NOT NULL,
	"doctrine_version" text NOT NULL,
	"doctrine_hash" text NOT NULL,
	"planner_version" text NOT NULL,
	"report_schema_version" text NOT NULL,
	"writer_version" text NOT NULL,
	"locale_pack_version" text NOT NULL,
	"safety_policy_version" text NOT NULL,
	"verifier_version" text NOT NULL,
	"renderer_version" text NOT NULL,
	"ready_at" timestamp with time zone NOT NULL,
	"purge_after" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "reports_order_version_unique" UNIQUE("order_id","report_version"),
	CONSTRAINT "reports_id_order_unique" UNIQUE("id","order_id"),
	CONSTRAINT "reports_report_version_positive" CHECK ("reports"."report_version" >= 1),
	CONSTRAINT "reports_row_version_positive" CHECK ("reports"."version" >= 1),
	CONSTRAINT "reports_ready_before_purge" CHECK ("reports"."purge_after" > "reports"."ready_at"),
	CONSTRAINT "reports_hashes_canonical" CHECK ("reports"."input_hash" ~ '^sha256:[0-9a-f]{64}$' AND "reports"."plan_hash" ~ '^sha256:[0-9a-f]{64}$' AND "reports"."report_hash" ~ '^sha256:[0-9a-f]{64}$' AND "reports"."verification_record_hash" ~ '^sha256:[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_principal_id_principals_id_fk" FOREIGN KEY ("principal_id") REFERENCES "public"."principals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_report_order_fk" FOREIGN KEY ("report_id","source_order_id") REFERENCES "public"."reports"("id","order_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_intent_owner_fk" FOREIGN KEY ("report_intent_id","principal_id") REFERENCES "public"."report_intents"("id","owner_principal_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_subject_owner_fk" FOREIGN KEY ("subject_id","principal_id") REFERENCES "public"."subjects"("id","owner_principal_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_attempts" ADD CONSTRAINT "job_attempts_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_order_subject_fk" FOREIGN KEY ("order_id","subject_id") REFERENCES "public"."orders"("id","subject_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_principal_created_idx" ON "orders" USING btree ("principal_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "job_attempts_report_idx" ON "job_attempts" USING btree ("report_id","started_at");--> statement-breakpoint
CREATE INDEX "reports_order_ready_idx" ON "reports" USING btree ("order_id","ready_at" DESC NULLS LAST);--> statement-breakpoint
CREATE FUNCTION prevent_report_snapshot_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'report generation snapshots are immutable; create a new report version'
    USING ERRCODE = '23514';
END;
$$;--> statement-breakpoint
CREATE TRIGGER reports_generation_snapshot_immutable
BEFORE UPDATE OF
  order_id, subject_id, report_version, locale,
  input_snapshot_ciphertext, calculation_snapshot_ciphertext, evidence_snapshot_ciphertext,
  plan_snapshot_ciphertext, structured_report_ciphertext,
  input_hash, plan_hash, report_hash, verification_json, verification_record_hash,
  engine_version, doctrine_version, doctrine_hash, planner_version, report_schema_version,
  writer_version, locale_pack_version, safety_policy_version, verifier_version, renderer_version,
  ready_at, purge_after, created_at
ON reports
FOR EACH ROW
EXECUTE FUNCTION prevent_report_snapshot_mutation();--> statement-breakpoint
CREATE TRIGGER job_attempts_append_only
BEFORE UPDATE OR DELETE ON job_attempts
FOR EACH ROW
EXECUTE FUNCTION reject_append_only_event_mutation();