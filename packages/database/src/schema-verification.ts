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

const checkpointFourTables = ["entitlements", "job_attempts", "orders", "reports"] as const;
const checkpointFourConstraints = [
  "entitlements_actions_required",
  "job_attempts_report_version_stage_unique",
  "orders_checkpoint4_nonpayable",
  "orders_intent_owner_fk",
  "reports_hashes_canonical",
  "reports_order_version_unique",
] as const;
const checkpointFourIndexes = [
  "job_attempts_report_idx",
  "orders_principal_created_idx",
  "reports_order_ready_idx",
] as const;
const checkpointFourTriggers = [
  "job_attempts_append_only",
  "reports_generation_snapshot_immutable",
] as const;
const checkpointFiveTables = ["analytics_events", "shared_rate_limits"] as const;
const checkpointFiveConstraints = [
  "analytics_events_properties_allowlist",
  "analytics_events_retention_exact",
  "analytics_events_schema_version",
  "report_intents_completed_has_subject",
  "shared_rate_limits_count_positive",
] as const;
const checkpointFiveIndexes = [
  "analytics_events_expiry_idx",
  "analytics_events_funnel_idx",
  "shared_rate_limits_updated_idx",
] as const;
const checkpointFiveTriggers = ["analytics_events_append_only"] as const;

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

export type CheckpointFourSchemaVerification = CheckpointOneSchemaVerification;
export type CheckpointFiveSchemaVerification = CheckpointOneSchemaVerification;

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

export async function verifyCheckpointFourSchema(
  pool: Pick<Pool, "query">,
): Promise<CheckpointFourSchemaVerification> {
  const [tables, constraints, indexes, triggers] = await Promise.all([
    pool.query<{ name: string }>(
      `SELECT table_name AS name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    ),
    pool.query<{ name: string }>(
      `SELECT constraint_name AS name FROM information_schema.table_constraints
        WHERE constraint_schema = 'public'`,
    ),
    pool.query<{ name: string }>(
      `SELECT indexname AS name FROM pg_indexes WHERE schemaname = 'public'`,
    ),
    pool.query<{ name: string }>(
      `SELECT trigger_name AS name FROM information_schema.triggers
        WHERE trigger_schema = 'public'`,
    ),
  ]);
  const tableNames = tables.rows.map((row) => row.name);
  const constraintNames = constraints.rows.map((row) => row.name);
  const indexNames = indexes.rows.map((row) => row.name);
  const triggerNames = triggers.rows.map((row) => row.name);
  const report = {
    missingConstraints: missing(
      [...requiredConstraints, ...checkpointFourConstraints],
      constraintNames,
    ),
    missingIndexes: missing([...requiredIndexes, ...checkpointFourIndexes], indexNames),
    missingTables: missing([...requiredTables, ...checkpointFourTables], tableNames),
    missingTriggers: missing([...requiredTriggers, ...checkpointFourTriggers], triggerNames),
  };
  return {
    ...report,
    valid: Object.values(report).every((names) => names.length === 0),
  };
}

export async function verifyCheckpointFiveSchema(
  pool: Pick<Pool, "query">,
): Promise<CheckpointFiveSchemaVerification> {
  const [tables, constraints, indexes, triggers] = await Promise.all([
    pool.query<{ name: string }>(
      `SELECT table_name AS name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    ),
    pool.query<{ name: string }>(
      `SELECT constraint_name AS name FROM information_schema.table_constraints
        WHERE constraint_schema = 'public'`,
    ),
    pool.query<{ name: string }>(
      `SELECT indexname AS name FROM pg_indexes WHERE schemaname = 'public'`,
    ),
    pool.query<{ name: string }>(
      `SELECT trigger_name AS name FROM information_schema.triggers
        WHERE trigger_schema = 'public'`,
    ),
  ]);
  const report = {
    missingConstraints: missing(
      [...requiredConstraints, ...checkpointFourConstraints, ...checkpointFiveConstraints],
      constraints.rows.map((row) => row.name),
    ),
    missingIndexes: missing(
      [...requiredIndexes, ...checkpointFourIndexes, ...checkpointFiveIndexes],
      indexes.rows.map((row) => row.name),
    ),
    missingTables: missing(
      [...requiredTables, ...checkpointFourTables, ...checkpointFiveTables],
      tables.rows.map((row) => row.name),
    ),
    missingTriggers: missing(
      [...requiredTriggers, ...checkpointFourTriggers, ...checkpointFiveTriggers],
      triggers.rows.map((row) => row.name),
    ),
  };
  return {
    ...report,
    valid: Object.values(report).every((names) => names.length === 0),
  };
}
