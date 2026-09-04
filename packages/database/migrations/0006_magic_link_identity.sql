ALTER TABLE "access_challenges" ADD COLUMN "browser_digest" "bytea";--> statement-breakpoint
ALTER TABLE "access_challenges" ADD COLUMN "pending_email_ciphertext" "bytea";--> statement-breakpoint
ALTER TABLE "access_challenges" ADD COLUMN "pending_email_key_version" smallint;--> statement-breakpoint
ALTER TABLE "access_challenges" ADD COLUMN "pending_locale" "supported_locale";