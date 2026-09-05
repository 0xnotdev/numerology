import { parseDatabaseEnvironment } from "@numerology/contracts";
import { createDatabasePool, type DatabasePool } from "@numerology/database/pool";
import {
  createDatabaseReadinessProbe,
  type DatabaseReadinessProbe,
} from "@numerology/database/readiness";
import { verifyCheckpointEightSchema } from "@numerology/database/schema-verification";

interface ReadinessState {
  pool?: DatabasePool;
  probe?: DatabaseReadinessProbe;
}

const globalReadinessState = globalThis as typeof globalThis & {
  __numerologyReadinessState?: ReadinessState;
};

function getReadinessState(): Required<ReadinessState> {
  const existing = globalReadinessState.__numerologyReadinessState;
  if (existing?.pool !== undefined && existing.probe !== undefined) {
    return { pool: existing.pool, probe: existing.probe };
  }

  const environment = parseDatabaseEnvironment(process.env);
  const pool = createDatabasePool({
    connectionString: environment.DATABASE_URL,
    connectionTimeoutMillis: environment.DATABASE_CONNECTION_TIMEOUT_MS,
    max: environment.DATABASE_POOL_MAX,
  });
  const probe = createDatabaseReadinessProbe(pool, {
    timeoutMs: environment.DATABASE_READINESS_TIMEOUT_MS,
  });
  const state = { pool, probe };
  globalReadinessState.__numerologyReadinessState = state;
  return state;
}

export async function checkDatabaseReadiness(): Promise<boolean> {
  const state = getReadinessState();
  if (!(await state.probe.check())) return false;
  return process.env.PAYMENTS_RUNTIME_ENABLED === "true"
    ? (await verifyCheckpointEightSchema(state.pool)).valid
    : true;
}
