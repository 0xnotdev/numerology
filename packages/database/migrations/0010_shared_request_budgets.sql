CREATE TABLE "shared_rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"count" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shared_rate_limits_count_positive" CHECK ("shared_rate_limits"."count" BETWEEN 1 AND 1000001)
);
--> statement-breakpoint
CREATE INDEX "shared_rate_limits_updated_idx" ON "shared_rate_limits" USING btree ("updated_at");