CREATE TYPE "public"."private_request_action" AS ENUM('correction', 'export', 'deletion');--> statement-breakpoint
CREATE TYPE "public"."private_request_status" AS ENUM('requested', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "private_access_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"principal_id" uuid NOT NULL,
	"report_id" uuid NOT NULL,
	"action" "private_request_action" NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"request_fingerprint" text NOT NULL,
	"status" "private_request_status" DEFAULT 'requested' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "private_access_requests_idempotency_unique" UNIQUE("principal_id","report_id","idempotency_key"),
	CONSTRAINT "private_access_requests_fingerprint_canonical" CHECK ("private_access_requests"."request_fingerprint" ~ '^sha256:[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "private_access_requests" ADD CONSTRAINT "private_access_requests_principal_id_principals_id_fk" FOREIGN KEY ("principal_id") REFERENCES "public"."principals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "private_access_requests_principal_idx" ON "private_access_requests" USING btree ("principal_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "private_access_requests_report_idx" ON "private_access_requests" USING btree ("report_id","created_at" DESC NULLS LAST);