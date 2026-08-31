import {
  createExpireReportIntents,
  LocalEnvelopeFieldProtector,
  type Clock,
} from "@numerology/application";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabasePool, createReportIntentRepository, runMigrations } from "./index";
import { resetTestDatabase, seedSyntheticIdentity } from "./test-support";

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://numerology:numerology@127.0.0.1:5432/numerology_test";
const pool = createDatabasePool({ connectionString, max: 3 });
const protector = new LocalEnvelopeFieldProtector({
  keyEncryptionKey: Buffer.alloc(32, 0x61),
  keyId: "expiry-test-v1",
  lookupKey: Buffer.alloc(32, 0x62),
});
const now = new Date("2026-08-31T16:00:00.000Z");
const clock: Clock = { now: () => now };

describe("ExpireReportIntents", () => {
  beforeAll(async () => {
    await resetTestDatabase(pool, connectionString);
    await runMigrations(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("expires due resumable drafts and erases their private draft content", async () => {
    const repository = createReportIntentRepository(pool);
    const dueOwner = "0199a72d-3f45-7df1-a730-1722c2538930";
    const dueSubject = "0199a72d-3f45-7df1-a730-1722c2538931";
    const dueIntent = "0199a72d-3f45-7df1-a730-1722c2538932";
    const futureOwner = "0199a72d-3f45-7df1-a730-1722c2538933";
    const futureSubject = "0199a72d-3f45-7df1-a730-1722c2538934";
    const futureIntent = "0199a72d-3f45-7df1-a730-1722c2538935";
    await seedSyntheticIdentity(pool, protector, {
      now: new Date("2026-08-24T16:00:00.000Z"),
      principalId: dueOwner,
      subjectId: dueSubject,
    });
    await seedSyntheticIdentity(pool, protector, {
      now: new Date("2026-08-31T15:00:00.000Z"),
      principalId: futureOwner,
      subjectId: futureSubject,
    });
    const dueDraft = await protector.protect('{"private":"erase-me"}', "report_intent_draft");
    const futureDraft = await protector.protect('{"private":"keep-me"}', "report_intent_draft");
    await repository.create({
      draftCiphertext: dueDraft.ciphertext,
      expiresAt: new Date("2026-08-31T15:59:59.000Z"),
      id: dueIntent,
      inputSchemaVersion: "1.0.0",
      locale: "en-IN",
      now: new Date("2026-08-24T16:00:00.000Z"),
      ownerPrincipalId: dueOwner,
      subjectId: dueSubject,
    });
    await repository.create({
      draftCiphertext: futureDraft.ciphertext,
      expiresAt: new Date("2026-09-07T16:00:00.000Z"),
      id: futureIntent,
      inputSchemaVersion: "1.0.0",
      locale: "en-IN",
      now: new Date("2026-08-31T15:00:00.000Z"),
      ownerPrincipalId: futureOwner,
      subjectId: futureSubject,
    });

    const command = createExpireReportIntents({ clock, protector, repository });
    const result = await command.execute({ limit: 100 });

    expect(result).toEqual({ expiredCount: 1 });
    const expired = await repository.findByIdForOwner(dueIntent, dueOwner);
    const retained = await repository.findByIdForOwner(futureIntent, futureOwner);
    expect(expired).toMatchObject({ status: "expired", version: 2 });
    await expect(
      protector.reveal(expired?.draftCiphertext ?? new Uint8Array(), "report_intent_draft"),
    ).resolves.toBe("{}");
    expect(retained).toMatchObject({ status: "draft", version: 1 });
    await expect(
      protector.reveal(retained?.draftCiphertext ?? new Uint8Array(), "report_intent_draft"),
    ).resolves.toContain("keep-me");
  });
});
