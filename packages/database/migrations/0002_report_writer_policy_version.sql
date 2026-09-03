ALTER TABLE "reports" ADD COLUMN "writer_policy_version" text;
--> statement-breakpoint
UPDATE "reports"
SET "writer_policy_version" = 'legacy-unversioned.1.0.0'
WHERE "writer_policy_version" IS NULL;
--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "writer_policy_version" SET NOT NULL;
--> statement-breakpoint
DROP TRIGGER "reports_generation_snapshot_immutable" ON "reports";
--> statement-breakpoint
CREATE TRIGGER reports_generation_snapshot_immutable
BEFORE UPDATE OF
  order_id, subject_id, report_version, locale,
  input_snapshot_ciphertext, calculation_snapshot_ciphertext, evidence_snapshot_ciphertext,
  plan_snapshot_ciphertext, structured_report_ciphertext,
  input_hash, plan_hash, report_hash, verification_json, verification_record_hash,
  engine_version, doctrine_version, doctrine_hash, planner_version, report_schema_version,
  writer_version, writer_policy_version, locale_pack_version, safety_policy_version,
  verifier_version, renderer_version, ready_at, purge_after, created_at
ON reports
FOR EACH ROW
EXECUTE FUNCTION prevent_report_snapshot_mutation();
