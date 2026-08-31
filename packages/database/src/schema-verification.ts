import type { Pool } from "pg";

const requiredTables = [
  "access_challenges",
  "audit_events",
  "consent_events",
  "name_uses",
  "principals",
  "report_intents",
  "schema_migrations",
  "sessions",
  "subjects",
] as const;

const requiredConstraints = [
  "access_challenges_attempts_range",
  "report_intents_completed_has_snapshot",
  "report_intents_snapshot_all_or_none",
  "report_intents_subject_owner_fk",
  "sessions_expiry_order",
  "subjects_purge_after_created",
] as const;

const requiredIndexes = [
  "access_challenges_one_active_idx",
  "report_intents_expiry_idx",
  "sessions_active_principal_idx",
  "subjects_owner_idx",
] as const;

const requiredTriggers = [
  "audit_events_append_only",
  "consent_events_append_only",
  "report_intents_snapshot_immutable",
] as const;

export interface CheckpointOneSchemaVerification {
  readonly missingConstraints: string[];
  readonly missingIndexes: string[];
  readonly missingTables: string[];
  readonly missingTriggers: string[];
  readonly valid: boolean;
}

function missing(required: readonly string[], actual: readonly string[]): string[] {
  const actualNames = new Set(actual);
  return required.filter((name) => !actualNames.has(name));
}

export async function verifyCheckpointOneSchema(
  pool: Pick<Pool, "query">,
): Promise<CheckpointOneSchemaVerification> {
  const [tables, constraints, indexes, triggers] = await Promise.all([
    pool.query<{ name: string }>(
      `SELECT table_name AS name
         FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'`,
    ),
    pool.query<{ name: string }>(
      `SELECT constraint_name AS name
         FROM information_schema.table_constraints
        WHERE constraint_schema = 'public'`,
    ),
    pool.query<{ name: string }>(
      `SELECT indexname AS name
         FROM pg_indexes
        WHERE schemaname = 'public'`,
    ),
    pool.query<{ name: string }>(
      `SELECT trigger_name AS name
         FROM information_schema.triggers
        WHERE trigger_schema = 'public'`,
    ),
  ]);

  const report = {
    missingConstraints: missing(
      requiredConstraints,
      constraints.rows.map((row) => row.name),
    ),
    missingIndexes: missing(
      requiredIndexes,
      indexes.rows.map((row) => row.name),
    ),
    missingTables: missing(
      requiredTables,
      tables.rows.map((row) => row.name),
    ),
    missingTriggers: missing(
      requiredTriggers,
      triggers.rows.map((row) => row.name),
    ),
  };

  return {
    ...report,
    valid: Object.values(report).every((names) => names.length === 0),
  };
}
