-- Snapshot immutability has one narrow exception: irreversible erasure at unpaid expiry.
CREATE OR REPLACE FUNCTION prevent_report_intent_snapshot_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.input_snapshot_ciphertext IS NOT NULL THEN
    IF OLD.status IN ('complete','preview_ready') AND NEW.status = 'expired'
       AND NEW.updated_at >= OLD.expires_at AND CURRENT_TIMESTAMP >= OLD.expires_at
       AND NEW.expires_at = OLD.expires_at
       AND NEW.subject_id IS NOT DISTINCT FROM OLD.subject_id
       AND NEW.owner_principal_id = OLD.owner_principal_id
       AND NEW.input_snapshot_ciphertext IS NULL AND NEW.input_hash IS NULL
       AND NEW.preview_json IS NULL
       AND NEW.notice_version IS NOT DISTINCT FROM OLD.notice_version
       AND NEW.required_consent_at IS NOT DISTINCT FROM OLD.required_consent_at
       AND NOT EXISTS (SELECT 1 FROM orders WHERE report_intent_id = OLD.id)
    THEN RETURN NEW; END IF;
    IF NEW.input_snapshot_ciphertext IS DISTINCT FROM OLD.input_snapshot_ciphertext
       OR NEW.input_hash IS DISTINCT FROM OLD.input_hash
       OR NEW.notice_version IS DISTINCT FROM OLD.notice_version
       OR NEW.required_consent_at IS DISTINCT FROM OLD.required_consent_at
       OR NEW.subject_id IS DISTINCT FROM OLD.subject_id
       OR NEW.draft_ciphertext IS DISTINCT FROM OLD.draft_ciphertext
    THEN RAISE EXCEPTION 'completed report intent snapshots are immutable' USING ERRCODE = '23514'; END IF;
  END IF;
  RETURN NEW;
END; $$;
--> statement-breakpoint
DROP TRIGGER report_intents_snapshot_immutable ON report_intents;
--> statement-breakpoint
CREATE TRIGGER report_intents_snapshot_immutable
BEFORE UPDATE ON report_intents FOR EACH ROW EXECUTE FUNCTION prevent_report_intent_snapshot_mutation();
