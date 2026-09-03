import type {
  CompleteReportIntent,
  CreateReportIntent,
  ExpireDueReportIntentDrafts,
  ReportIntentRecord,
  ReportIntentRepository,
  SaveReportIntentDraft,
} from "@numerology/application";
import { OptimisticConcurrencyError, ReportIntentNotFoundError } from "@numerology/application";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { DatabasePool } from "./pool";
import * as schema from "./schema";
import { consentEvents, reportIntents } from "./schema";

function toRecord(row: typeof reportIntents.$inferSelect): ReportIntentRecord {
  return {
    createdAt: row.createdAt,
    draftCiphertext: row.draftCiphertext,
    expiresAt: row.expiresAt,
    id: row.id,
    inputHash: row.inputHash,
    inputSchemaVersion: row.inputSchemaVersion,
    inputSnapshotCiphertext: row.inputSnapshotCiphertext,
    locale: row.locale,
    noticeVersion: row.noticeVersion,
    ownerPrincipalId: row.ownerPrincipalId,
    requiredConsentAt: row.requiredConsentAt,
    status: row.status,
    subjectId: row.subjectId,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

export function createReportIntentRepository(pool: DatabasePool): ReportIntentRepository {
  const database = drizzle(pool, { schema });

  return {
    async complete(input: CompleteReportIntent): Promise<ReportIntentRecord> {
      return database.transaction(async (transaction) => {
        const rows = await transaction
          .update(reportIntents)
          .set({
            inputHash: Buffer.from(input.inputHash),
            inputSnapshotCiphertext: Buffer.from(input.inputSnapshotCiphertext),
            noticeVersion: input.noticeVersion,
            requiredConsentAt: input.requiredConsentAt,
            status: "complete",
            updatedAt: input.now,
            version: sql`${reportIntents.version} + 1`,
          })
          .where(
            and(
              eq(reportIntents.id, input.id),
              eq(reportIntents.ownerPrincipalId, input.ownerPrincipalId),
              eq(reportIntents.status, "draft"),
              eq(reportIntents.version, input.expectedVersion),
            ),
          )
          .returning();
        const completed = rows[0];
        if (!completed) {
          const existing = await transaction
            .select({ id: reportIntents.id })
            .from(reportIntents)
            .where(
              and(
                eq(reportIntents.id, input.id),
                eq(reportIntents.ownerPrincipalId, input.ownerPrincipalId),
              ),
            )
            .limit(1);
          if (existing.length === 0) throw new ReportIntentNotFoundError();
          throw new OptimisticConcurrencyError();
        }
        if (
          input.consentEvents.length !== 3 ||
          new Set(input.consentEvents.map((event) => event.purpose)).size !== 3 ||
          input.consentEvents.some(
            (event) =>
              event.noticeVersion !== input.noticeVersion ||
              event.noticeLocale !== completed.locale ||
              event.occurredAt.valueOf() !== input.requiredConsentAt.valueOf(),
          )
        ) {
          throw new RangeError("CONSENT_EVIDENCE_INVALID");
        }
        await transaction.insert(consentEvents).values(
          input.consentEvents.map((event) => ({
            action: event.action,
            id: event.id,
            noticeLocale: event.noticeLocale,
            noticeVersion: event.noticeVersion,
            occurredAt: event.occurredAt,
            principalId: input.ownerPrincipalId,
            purpose: event.purpose,
            reportIntentId: input.id,
          })),
        );
        return toRecord(completed);
      });
    },

    async create(input: CreateReportIntent): Promise<ReportIntentRecord> {
      const rows = await database
        .insert(reportIntents)
        .values({
          createdAt: input.now,
          draftCiphertext: Buffer.from(input.draftCiphertext),
          expiresAt: input.expiresAt,
          id: input.id,
          inputSchemaVersion: input.inputSchemaVersion,
          locale: input.locale,
          ownerPrincipalId: input.ownerPrincipalId,
          subjectId: input.subjectId,
          updatedAt: input.now,
        })
        .returning();
      const created = rows[0];
      if (!created) {
        throw new Error("The report intent insert returned no row.");
      }
      return toRecord(created);
    },

    async expireDueDrafts(input: ExpireDueReportIntentDrafts): Promise<number> {
      const result = await pool.query<{ id: string }>(
        `WITH due AS (
           SELECT id
             FROM report_intents
            WHERE status = 'draft'
              AND expires_at <= $1
            ORDER BY expires_at, id
            LIMIT $2
            FOR UPDATE SKIP LOCKED
         )
         UPDATE report_intents AS intent
            SET status = 'expired',
                draft_ciphertext = $3,
                updated_at = $4,
                version = intent.version + 1
           FROM due
          WHERE intent.id = due.id
      RETURNING intent.id`,
        [input.before, input.limit, Buffer.from(input.tombstoneCiphertext), input.now],
      );
      return result.rowCount ?? 0;
    },

    async findByIdForOwner(
      id: string,
      ownerPrincipalId: string,
    ): Promise<ReportIntentRecord | null> {
      const rows = await database
        .select()
        .from(reportIntents)
        .where(and(eq(reportIntents.id, id), eq(reportIntents.ownerPrincipalId, ownerPrincipalId)))
        .limit(1);
      const row = rows[0];
      return row ? toRecord(row) : null;
    },

    async saveDraft(input: SaveReportIntentDraft): Promise<ReportIntentRecord> {
      const rows = await database
        .update(reportIntents)
        .set({
          draftCiphertext: Buffer.from(input.draftCiphertext),
          updatedAt: input.now,
          version: sql`${reportIntents.version} + 1`,
        })
        .where(
          and(
            eq(reportIntents.id, input.id),
            eq(reportIntents.ownerPrincipalId, input.ownerPrincipalId),
            eq(reportIntents.status, "draft"),
            eq(reportIntents.version, input.expectedVersion),
          ),
        )
        .returning();
      const saved = rows[0];
      if (saved) {
        return toRecord(saved);
      }

      const existing = await this.findByIdForOwner(input.id, input.ownerPrincipalId);
      if (!existing) {
        throw new ReportIntentNotFoundError();
      }
      throw new OptimisticConcurrencyError();
    },
  };
}
