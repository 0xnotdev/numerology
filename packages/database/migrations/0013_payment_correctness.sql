-- CP8: durable ₹499 payment, fulfilment and pending-report schema.
CREATE TYPE "public"."payment_event_type" AS ENUM('payment.authorized', 'payment.captured', 'payment.failed');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('created', 'authorized', 'captured', 'failed', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."refund_request_status" AS ENUM('requested', 'approved', 'submitted', 'refunded', 'failed');--> statement-breakpoint
ALTER TYPE "public"."fixture_order_status" ADD VALUE 'pending';--> statement-breakpoint
ALTER TYPE "public"."fixture_order_status" ADD VALUE 'ambiguous';--> statement-breakpoint
ALTER TYPE "public"."fixture_order_status" ADD VALUE 'paid';--> statement-breakpoint
ALTER TYPE "public"."fixture_order_status" ADD VALUE 'failed';--> statement-breakpoint
ALTER TYPE "public"."fixture_order_status" ADD VALUE 'expired';--> statement-breakpoint
ALTER TYPE "public"."fixture_order_status" ADD VALUE 'refunded';--> statement-breakpoint
ALTER TYPE "public"."report_status" ADD VALUE 'pending' BEFORE 'ready';--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"report_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"schema_version" text NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"delivery_key" text NOT NULL,
	"payload_json" jsonb NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "outbox_events_order_event_unique" UNIQUE("order_id","event_type"),
	CONSTRAINT "outbox_events_delivery_key_unique" UNIQUE("delivery_key"),
	CONSTRAINT "outbox_events_type_fixed" CHECK ("outbox_events"."event_type" = 'report.generation.requested.v1'),
	CONSTRAINT "outbox_events_schema_version_fixed" CHECK ("outbox_events"."schema_version" = '1.0.0'),
	CONSTRAINT "outbox_events_aggregate_type_fixed" CHECK ("outbox_events"."aggregate_type" = 'report'),
	CONSTRAINT "outbox_events_payload_report_only" CHECK ("outbox_events"."payload_json" = jsonb_build_object('reportId', to_jsonb("outbox_events"."aggregate_id"::text))),
	CONSTRAINT "outbox_events_attempt_nonnegative" CHECK ("outbox_events"."attempt_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"provider_event_id" text PRIMARY KEY NOT NULL,
	"event_type" "payment_event_type" NOT NULL,
	"provider_order_id" text NOT NULL,
	"provider_payment_id" text,
	"payload_json" jsonb NOT NULL,
	"outcome" text NOT NULL,
	"raw_body_hash" text NOT NULL,
	"source" text NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_events_outcome_allowlist" CHECK ("payment_events"."outcome" IN ('accepted', 'duplicate')),
	CONSTRAINT "payment_events_payload_allowlist" CHECK ("payment_events"."payload_json" = jsonb_build_object('source', "payment_events"."payload_json"->>'source')),
	CONSTRAINT "payment_events_raw_hash_canonical" CHECK ("payment_events"."raw_body_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "payment_events_source_allowlist" CHECK ("payment_events"."source" IN ('webhook', 'checkout_proof', 'reconciliation'))
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"provider_payment_id" text NOT NULL,
	"provider_order_id" text NOT NULL,
	"status" "payment_status" NOT NULL,
	"amount_paise" integer NOT NULL,
	"currency" varchar(3) NOT NULL,
	"receipt" varchar(40),
	"captured_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_provider_payment_unique" UNIQUE("provider_payment_id"),
	CONSTRAINT "payments_order_provider_payment_unique" UNIQUE("order_id","provider_payment_id"),
	CONSTRAINT "payments_amount_positive" CHECK ("payments"."amount_paise" > 0),
	CONSTRAINT "payments_currency_inr" CHECK ("payments"."currency" = 'INR'),
	CONSTRAINT "payments_provider_ids_canonical" CHECK ("payments"."provider_payment_id" ~ '^pay_[A-Za-z0-9_-]{1,80}$' AND "payments"."provider_order_id" ~ '^order_[A-Za-z0-9_-]{1,80}$'),
	CONSTRAINT "payments_captured_at_shape" CHECK (("payments"."status" IN ('captured', 'refunded')) = ("payments"."captured_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "refund_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"principal_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"provider_payment_id" text NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"amount_paise" integer NOT NULL,
	"currency" varchar(3) NOT NULL,
	"status" "refund_request_status" DEFAULT 'requested' NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"provider_refund_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refund_requests_principal_order_idempotency_unique" UNIQUE("principal_id","order_id","idempotency_key"),
	CONSTRAINT "refund_requests_amount_exact" CHECK ("refund_requests"."amount_paise" = 49900),
	CONSTRAINT "refund_requests_currency_inr" CHECK ("refund_requests"."currency" = 'INR'),
	CONSTRAINT "refund_requests_approval_shape" CHECK (("refund_requests"."status" = 'requested' AND "refund_requests"."approved_by" IS NULL AND "refund_requests"."approved_at" IS NULL AND "refund_requests"."provider_refund_id" IS NULL) OR
        ("refund_requests"."status" = 'approved' AND "refund_requests"."approved_by" IS NOT NULL AND "refund_requests"."approved_at" IS NOT NULL AND "refund_requests"."provider_refund_id" IS NULL) OR
        ("refund_requests"."status" IN ('submitted', 'refunded', 'failed') AND "refund_requests"."approved_by" IS NOT NULL AND "refund_requests"."approved_at" IS NOT NULL AND "refund_requests"."provider_refund_id" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_checkpoint4_nonpayable";--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "input_snapshot_ciphertext" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "calculation_snapshot_ciphertext" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "evidence_snapshot_ciphertext" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "plan_snapshot_ciphertext" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "structured_report_ciphertext" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "input_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "plan_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "report_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "verification_json" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "verification_record_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "engine_version" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "doctrine_version" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "doctrine_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "planner_version" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "report_schema_version" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "writer_version" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "writer_policy_version" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "locale_pack_version" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "safety_policy_version" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "verifier_version" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "renderer_version" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "ready_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "provider_order_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "receipt" varchar(40);--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_principal_id_principals_id_fk" FOREIGN KEY ("principal_id") REFERENCES "public"."principals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_events_order_idx" ON "payment_events" USING btree ("provider_order_id","received_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "payments_order_idx" ON "payments" USING btree ("order_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "refund_requests_order_idx" ON "refund_requests" USING btree ("order_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "orders_provider_order_unique" ON "orders" USING btree ("provider_order_id") WHERE "orders"."provider_order_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "orders_receipt_unique" ON "orders" USING btree ("receipt") WHERE "orders"."receipt" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_provider_fields_shape" CHECK (("orders"."payable" = false AND "orders"."provider_order_id" IS NULL AND "orders"."receipt" IS NULL) OR
        ("orders"."payable" = true AND "orders"."receipt" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_paid_requires_provider_order" CHECK ("orders"."status"::text NOT IN ('paid', 'refunded') OR
        ("orders"."payable" = true AND "orders"."provider_order_id" IS NOT NULL AND "orders"."receipt" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_checkpoint4_nonpayable" CHECK (("orders"."payable" = false AND "orders"."amount_paise" = 0) OR
        ("orders"."payable" = true AND "orders"."amount_paise" = 49900 AND
         "orders"."currency" = 'INR' AND "orders"."product_version" = 'personal-numerology-report-v1'));--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_generation_artifacts_shape" CHECK (("reports"."status"::text = 'pending' AND
        "reports"."input_snapshot_ciphertext" IS NULL AND
        "reports"."calculation_snapshot_ciphertext" IS NULL AND
        "reports"."evidence_snapshot_ciphertext" IS NULL AND
        "reports"."plan_snapshot_ciphertext" IS NULL AND
        "reports"."structured_report_ciphertext" IS NULL AND
        "reports"."input_hash" IS NULL AND "reports"."plan_hash" IS NULL AND
        "reports"."report_hash" IS NULL AND "reports"."verification_json" IS NULL AND
        "reports"."verification_record_hash" IS NULL AND "reports"."engine_version" IS NULL AND
        "reports"."doctrine_version" IS NULL AND "reports"."doctrine_hash" IS NULL AND
        "reports"."planner_version" IS NULL AND "reports"."report_schema_version" IS NULL AND
        "reports"."writer_version" IS NULL AND "reports"."writer_policy_version" IS NULL AND
        "reports"."locale_pack_version" IS NULL AND "reports"."safety_policy_version" IS NULL AND
        "reports"."verifier_version" IS NULL AND "reports"."renderer_version" IS NULL AND
        "reports"."ready_at" IS NULL) OR
       ("reports"."status"::text <> 'pending' AND
        "reports"."input_snapshot_ciphertext" IS NOT NULL AND
        "reports"."calculation_snapshot_ciphertext" IS NOT NULL AND
        "reports"."evidence_snapshot_ciphertext" IS NOT NULL AND
        "reports"."plan_snapshot_ciphertext" IS NOT NULL AND
        "reports"."structured_report_ciphertext" IS NOT NULL AND
        "reports"."input_hash" IS NOT NULL AND "reports"."plan_hash" IS NOT NULL AND
        "reports"."report_hash" IS NOT NULL AND "reports"."verification_json" IS NOT NULL AND
        "reports"."verification_record_hash" IS NOT NULL AND "reports"."engine_version" IS NOT NULL AND
        "reports"."doctrine_version" IS NOT NULL AND "reports"."doctrine_hash" IS NOT NULL AND
        "reports"."planner_version" IS NOT NULL AND "reports"."report_schema_version" IS NOT NULL AND
        "reports"."writer_version" IS NOT NULL AND "reports"."writer_policy_version" IS NOT NULL AND
        "reports"."locale_pack_version" IS NOT NULL AND "reports"."safety_policy_version" IS NOT NULL AND
        "reports"."verifier_version" IS NOT NULL AND "reports"."renderer_version" IS NOT NULL AND
        "reports"."ready_at" IS NOT NULL));--> statement-breakpoint
DROP TRIGGER "reports_generation_snapshot_immutable" ON "reports";--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_report_snapshot_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'pending' AND NEW.status = 'ready'
     AND NEW.id = OLD.id
     AND NEW.order_id = OLD.order_id
     AND NEW.subject_id = OLD.subject_id
     AND NEW.report_version = OLD.report_version
     AND NEW.locale = OLD.locale
     AND NEW.purge_after = OLD.purge_after
     AND NEW.created_at = OLD.created_at
     AND OLD.input_snapshot_ciphertext IS NULL
     AND OLD.calculation_snapshot_ciphertext IS NULL
     AND OLD.evidence_snapshot_ciphertext IS NULL
     AND OLD.plan_snapshot_ciphertext IS NULL
     AND OLD.structured_report_ciphertext IS NULL
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'report generation snapshots are immutable; create a new report version'
    USING ERRCODE = '23514';
END;
$$;--> statement-breakpoint
CREATE TRIGGER reports_generation_snapshot_immutable
BEFORE UPDATE OF
  id, order_id, subject_id, report_version, locale,
  input_snapshot_ciphertext, calculation_snapshot_ciphertext, evidence_snapshot_ciphertext,
  plan_snapshot_ciphertext, structured_report_ciphertext,
  input_hash, plan_hash, report_hash, verification_json, verification_record_hash,
  engine_version, doctrine_version, doctrine_hash, planner_version, report_schema_version,
  writer_version, writer_policy_version, locale_pack_version, safety_policy_version,
  verifier_version, renderer_version, ready_at, purge_after, created_at
ON reports
FOR EACH ROW
EXECUTE FUNCTION prevent_report_snapshot_mutation();
