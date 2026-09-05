-- CP8: composite integrity, immutable financial identity and append-only evidence.
ALTER TABLE "orders" DROP CONSTRAINT "orders_checkpoint4_nonpayable";--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_provider_fields_shape";--> statement-breakpoint
ALTER TABLE "payment_events" DROP CONSTRAINT "payment_events_payload_allowlist";--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT "payments_amount_positive";--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_report_order_fk" FOREIGN KEY ("report_id","order_id") REFERENCES "public"."reports"("id","order_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_payment_order_fk" FOREIGN KEY ("order_id","provider_payment_id") REFERENCES "public"."payments"("order_id","provider_payment_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "outbox_events_unpublished_idx" ON "outbox_events" USING btree ("created_at") WHERE "outbox_events"."published_at" IS NULL;--> statement-breakpoint
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_one_full_refund_per_order" UNIQUE("order_id");--> statement-breakpoint
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_provider_refund_unique" UNIQUE("provider_refund_id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_checkpoint4_nonpayable" CHECK (("orders"."payable" = false AND "orders"."amount_paise" = 0 AND "orders"."currency" = 'INR' AND "orders"."status" = 'fixture_ready') OR
        ("orders"."payable" = true AND "orders"."amount_paise" = 49900 AND
         "orders"."currency" = 'INR' AND "orders"."product_version" = 'personal-numerology-report-v1'));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_provider_fields_shape" CHECK (("orders"."payable" = false AND "orders"."provider_order_id" IS NULL AND "orders"."receipt" IS NULL) OR
        ("orders"."payable" = true AND "orders"."receipt" IS NOT NULL AND "orders"."receipt" = "orders"."id"::text
          AND "orders"."status" <> 'fixture_ready'
          AND ("orders"."provider_order_id" IS NULL OR "orders"."provider_order_id" ~ '^order_[A-Za-z0-9_-]{1,80}$')));--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_aggregate_report_match" CHECK ("outbox_events"."aggregate_id" = "outbox_events"."report_id");--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_payload_allowlist" CHECK ("payment_events"."payload_json" = jsonb_build_object('source', "payment_events"."source"));--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_positive" CHECK ("payments"."amount_paise" = 49900);--> statement-breakpoint
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_provider_refund_canonical" CHECK ("refund_requests"."provider_refund_id" IS NULL OR "refund_requests"."provider_refund_id" ~ '^rfnd_[A-Za-z0-9_-]{1,80}$');
--> statement-breakpoint
CREATE TRIGGER payment_events_append_only
BEFORE UPDATE OR DELETE ON payment_events
FOR EACH ROW EXECUTE FUNCTION reject_append_only_event_mutation();
--> statement-breakpoint
CREATE TRIGGER outbox_events_payload_immutable
BEFORE UPDATE OF id, order_id, report_id, event_type, schema_version, aggregate_type,
  aggregate_id, delivery_key, payload_json, created_at ON outbox_events
FOR EACH ROW EXECUTE FUNCTION reject_append_only_event_mutation();
--> statement-breakpoint
CREATE TRIGGER orders_price_snapshot_immutable
BEFORE UPDATE OF id, principal_id, report_intent_id, subject_id, product_version,
  payable, amount_paise, currency, receipt, created_at ON orders
FOR EACH ROW EXECUTE FUNCTION reject_append_only_event_mutation();
--> statement-breakpoint
CREATE TRIGGER payments_financial_identity_immutable
BEFORE UPDATE OF id, order_id, provider_payment_id, provider_order_id, amount_paise,
  currency, receipt, created_at ON payments
FOR EACH ROW EXECUTE FUNCTION reject_append_only_event_mutation();
--> statement-breakpoint
CREATE TRIGGER refund_requests_identity_immutable
BEFORE UPDATE OF id, principal_id, order_id, provider_payment_id, idempotency_key,
  amount_paise, currency, created_at ON refund_requests
FOR EACH ROW EXECUTE FUNCTION reject_append_only_event_mutation();
