CREATE TYPE "public"."prepayment_analytics_event_name" AS ENUM('landing_viewed', 'intake_started', 'intake_step_completed', 'intake_reviewed', 'preview_viewed');--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_name" "prepayment_analytics_event_name" NOT NULL,
	"schema_version" varchar(20) NOT NULL,
	"session_id" uuid NOT NULL,
	"properties" jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analytics_events_schema_version" CHECK ("analytics_events"."schema_version" = '1.0.0'),
	CONSTRAINT "analytics_events_retention_exact" CHECK ("analytics_events"."expires_at" = "analytics_events"."occurred_at" + interval '90 days'),
	CONSTRAINT "analytics_events_properties_allowlist" CHECK (jsonb_typeof("analytics_events"."properties") = 'object'
        AND "analytics_events"."properties" ? 'locale'
        AND ("analytics_events"."properties"->>'locale') IN ('en-IN', 'hi-IN', 'or-IN')
        AND CASE "analytics_events"."event_name"
          WHEN 'landing_viewed' THEN "analytics_events"."properties" - ARRAY['campaign', 'deviceClass', 'locale', 'pageVersion'] = '{}'::jsonb
          WHEN 'intake_started' THEN "analytics_events"."properties" - ARRAY['experimentId', 'locale'] = '{}'::jsonb
          WHEN 'intake_step_completed' THEN "analytics_events"."properties" - ARRAY['elapsedBucket', 'locale', 'step'] = '{}'::jsonb
          WHEN 'intake_reviewed' THEN "analytics_events"."properties" - ARRAY['elapsedBucket', 'locale'] = '{}'::jsonb
          WHEN 'preview_viewed' THEN "analytics_events"."properties" - ARRAY['locale', 'previewVersion'] = '{}'::jsonb
          ELSE false
        END)
);
--> statement-breakpoint
CREATE INDEX "analytics_events_funnel_idx" ON "analytics_events" USING btree ("event_name","occurred_at");--> statement-breakpoint
CREATE INDEX "analytics_events_expiry_idx" ON "analytics_events" USING btree ("expires_at");--> statement-breakpoint
CREATE TRIGGER analytics_events_append_only
BEFORE UPDATE OR DELETE ON analytics_events
FOR EACH ROW
EXECUTE FUNCTION reject_append_only_event_mutation();
