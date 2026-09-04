CREATE INDEX "access_challenges_sign_in_expiry_idx" ON "access_challenges" USING btree ("expires_at") WHERE "access_challenges"."purpose" = 'sign_in';--> statement-breakpoint
ALTER TABLE "access_challenges" ADD CONSTRAINT "access_challenges_pending_sign_in_valid" CHECK ("access_challenges"."pending_email_ciphertext" IS NULL OR (
      "access_challenges"."purpose" = 'sign_in' AND "access_challenges"."browser_digest" IS NOT NULL
      AND octet_length("access_challenges"."browser_digest") = 32 AND "access_challenges"."pending_email_key_version" IS NOT NULL
      AND "access_challenges"."pending_email_key_version" >= 1 AND "access_challenges"."pending_locale" IS NOT NULL
      AND "access_challenges"."expires_at" > "access_challenges"."created_at" AND "access_challenges"."expires_at" <= "access_challenges"."created_at" + interval '10 minutes'));