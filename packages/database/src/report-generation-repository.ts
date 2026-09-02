import type {
  CreateFixtureReadyReport,
  FixtureReadyReportRecord,
  ReportGenerationRepository,
} from "@numerology/application";
import { parseReportId } from "@numerology/report";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { DatabasePool } from "./pool";
import { entitlements, fixtureOrders, jobAttempts, reports } from "./schema";
import * as schema from "./schema";

function toRecord(row: typeof reports.$inferSelect): FixtureReadyReportRecord {
  if (row.status !== "ready") {
    throw new Error(`REPORT_STATUS_NOT_READY: ${row.status}`);
  }
  return {
    createdAt: row.createdAt,
    locale: row.locale,
    orderId: row.orderId,
    planHash: row.planHash,
    reportHash: row.reportHash,
    reportId: parseReportId(row.id),
    reportVersion: row.reportVersion,
    status: row.status,
    subjectId: row.subjectId,
    verificationRecordHash: row.verificationRecordHash,
  };
}

export function createReportGenerationRepository(pool: DatabasePool): ReportGenerationRepository {
  const database = drizzle(pool, { schema });
  return {
    async createFixtureReady(input: CreateFixtureReadyReport): Promise<FixtureReadyReportRecord> {
      return database.transaction(async (transaction) => {
        await transaction.insert(fixtureOrders).values({
          createdAt: input.createdAt,
          id: input.orderId,
          principalId: input.principalId,
          productVersion: input.productVersion,
          reportIntentId: input.reportIntentId,
          subjectId: input.subjectId,
          updatedAt: input.createdAt,
        });
        const rows = await transaction
          .insert(reports)
          .values({
            calculationSnapshotCiphertext: Buffer.from(input.snapshots.calculation),
            createdAt: input.createdAt,
            doctrineHash: input.versions.doctrineHash,
            doctrineVersion: input.versions.doctrine,
            engineVersion: input.versions.engine,
            evidenceSnapshotCiphertext: Buffer.from(input.snapshots.evidence),
            id: input.reportId,
            inputHash: input.versions.inputHash,
            inputSnapshotCiphertext: Buffer.from(input.snapshots.input),
            locale: input.locale,
            localePackVersion: input.versions.localePack,
            orderId: input.orderId,
            planHash: input.planHash,
            planSnapshotCiphertext: Buffer.from(input.snapshots.plan),
            plannerVersion: input.versions.planner,
            purgeAfter: new Date(input.createdAt.getTime() + 30 * 24 * 60 * 60 * 1_000),
            readyAt: input.createdAt,
            rendererVersion: input.versions.renderer,
            reportHash: input.reportHash,
            reportSchemaVersion: input.versions.reportSchema,
            reportVersion: input.reportVersion,
            safetyPolicyVersion: input.versions.safetyPolicy,
            structuredReportCiphertext: Buffer.from(input.snapshots.structuredReport),
            subjectId: input.subjectId,
            updatedAt: input.createdAt,
            verificationJson: input.verification,
            verificationRecordHash: input.verification.recordHash,
            verifierVersion: input.versions.verifier,
            writerVersion: input.versions.prompt,
          })
          .returning();
        const created = rows[0];
        if (created === undefined) {
          throw new Error("The ready report insert returned no row.");
        }
        await transaction.insert(entitlements).values({
          actions: ["view"],
          createdAt: input.createdAt,
          grantedAt: input.createdAt,
          id: input.entitlementId,
          principalId: input.principalId,
          reportId: input.reportId,
          sourceOrderId: input.orderId,
        });
        await transaction.insert(jobAttempts).values({
          createdAt: input.createdAt,
          diagnosticCodes: [],
          finishedAt: input.createdAt,
          generationVersion: input.reportVersion,
          id: input.jobAttemptId,
          outcome: "succeeded",
          reportId: input.reportId,
          stage: "fixture_generation",
          startedAt: input.createdAt,
        });
        return toRecord(created);
      });
    },

    async findReadyById(reportId) {
      const rows = await database
        .select()
        .from(reports)
        .where(and(eq(reports.id, reportId), eq(reports.status, "ready")))
        .limit(1);
      const row = rows[0];
      return row === undefined ? null : toRecord(row);
    },
  };
}
