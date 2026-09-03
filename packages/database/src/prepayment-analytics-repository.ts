import type {
  PrepaymentAnalyticsEventRecord,
  PrepaymentAnalyticsRepository,
} from "@numerology/application";
import { drizzle } from "drizzle-orm/node-postgres";
import type { DatabasePool } from "./pool";
import * as schema from "./schema";
import { analyticsEvents } from "./schema";

/** PostgreSQL append adapter; schema constraints repeat the event/property allowlist defensively. */
export function createPrepaymentAnalyticsRepository(
  pool: DatabasePool,
): PrepaymentAnalyticsRepository {
  const database = drizzle(pool, { schema });
  return {
    async append(event: PrepaymentAnalyticsEventRecord): Promise<void> {
      await database.insert(analyticsEvents).values({
        eventName: event.eventName,
        expiresAt: event.expiresAt,
        id: event.id,
        occurredAt: event.occurredAt,
        properties: event.properties,
        schemaVersion: event.schemaVersion,
        sessionId: event.sessionId,
      });
    },
  };
}
