CREATE TABLE "report_intent_create_requests" (
	"owner_principal_id" uuid NOT NULL,
	"operation" varchar(40) NOT NULL,
	"key" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"request_fingerprint" varchar(64) NOT NULL,
	"response_ciphertext" "bytea" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_intent_create_request_key" UNIQUE("owner_principal_id","operation","key"),
	CONSTRAINT "report_intent_create_request_resource" UNIQUE("resource_id"),
	CONSTRAINT "report_intent_create_request_operation" CHECK ("report_intent_create_requests"."operation" = 'report-intents.create'),
	CONSTRAINT "report_intent_create_request_fingerprint" CHECK ("report_intent_create_requests"."request_fingerprint" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "report_intent_create_request_expiry" CHECK ("report_intent_create_requests"."expires_at" > "report_intent_create_requests"."created_at" AND "report_intent_create_requests"."expires_at" <= "report_intent_create_requests"."created_at" + interval '24 hours')
);
--> statement-breakpoint
ALTER TABLE "report_intent_create_requests" ADD CONSTRAINT "report_intent_create_requests_owner_principal_id_principals_id_fk" FOREIGN KEY ("owner_principal_id") REFERENCES "public"."principals"("id") ON DELETE cascade ON UPDATE no action;