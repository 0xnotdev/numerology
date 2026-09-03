import { LocalEnvelopeFieldProtector } from "@numerology/application";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabasePool, createReportIntentRepository, runMigrations } from "./index";
import { resetTestDatabase, seedSyntheticIdentity } from "./test-support";

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://numerology:numerology@127.0.0.1:5432/numerology_test";
const pool = createDatabasePool({ connectionString, max: 3 });
const protector = new LocalEnvelopeFieldProtector({
  keyEncryptionKey: Buffer.alloc(32, 0x41),
  keyId: "repository-test-v1",
  lookupKey: Buffer.alloc(32, 0x42),
});

describe("PostgresReportIntentRepository", () => {
  beforeAll(async () => {
    await resetTestDatabase(pool, connectionString);
    await runMigrations(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("persists and resumes an encrypted draft without storing its plaintext", async () => {
    const principalId = "0199a72d-3f45-7df1-a730-1722c2538921";
    const subjectId = "0199a72d-3f45-7df1-a730-1722c2538922";
    const intentId = "0199a72d-3f45-7df1-a730-1722c2538923";
    const plaintextCanary = "PLAINTEXT_CANARY_ALICE_1990_08_12";
    const now = new Date("2026-08-31T15:30:00.000Z");
    await seedSyntheticIdentity(pool, protector, { principalId, subjectId, now });
    const draft = await protector.protect(
      JSON.stringify({ displayName: plaintextCanary, step: "identity" }),
      "report_intent_draft",
    );
    const repository = createReportIntentRepository(pool);

    await repository.create({
      draftCiphertext: draft.ciphertext,
      expiresAt: new Date("2026-09-07T15:30:00.000Z"),
      id: intentId,
      inputSchemaVersion: "1.0.0",
      locale: "en-IN",
      now,
      ownerPrincipalId: principalId,
      subjectId,
    });

    const resumed = await repository.findByIdForOwner(intentId, principalId);
    expect(resumed).not.toBeNull();
    await expect(
      protector.reveal(resumed?.draftCiphertext ?? new Uint8Array(), "report_intent_draft"),
    ).resolves.toBe(JSON.stringify({ displayName: plaintextCanary, step: "identity" }));
    expect(resumed).toMatchObject({ id: intentId, status: "draft", version: 1 });

    const storage = await pool.query<{ contains_plaintext: boolean }>(
      `SELECT position(convert_to($1, 'UTF8') in draft_ciphertext) > 0 AS contains_plaintext
         FROM report_intents
        WHERE id = $2`,
      [plaintextCanary, intentId],
    );
    expect(storage.rows[0]?.contains_plaintext).toBe(false);
  });

  it("allows exactly one concurrent update for an expected intent version", async () => {
    const principalId = "0199a72d-3f45-7df1-a730-1722c2538924";
    const subjectId = "0199a72d-3f45-7df1-a730-1722c2538925";
    const intentId = "0199a72d-3f45-7df1-a730-1722c2538926";
    const now = new Date("2026-08-31T15:31:00.000Z");
    await seedSyntheticIdentity(pool, protector, { principalId, subjectId, now });
    const initial = await protector.protect('{"step":"start"}', "report_intent_draft");
    const first = await protector.protect('{"step":"identity-a"}', "report_intent_draft");
    const second = await protector.protect('{"step":"identity-b"}', "report_intent_draft");
    const repository = createReportIntentRepository(pool);
    await repository.create({
      draftCiphertext: initial.ciphertext,
      expiresAt: new Date("2026-09-07T15:31:00.000Z"),
      id: intentId,
      inputSchemaVersion: "1.0.0",
      locale: "en-IN",
      now,
      ownerPrincipalId: principalId,
      subjectId,
    });

    const results = await Promise.allSettled([
      repository.saveDraft({
        draftCiphertext: first.ciphertext,
        expectedVersion: 1,
        id: intentId,
        now: new Date("2026-08-31T15:32:00.000Z"),
        ownerPrincipalId: principalId,
      }),
      repository.saveDraft({
        draftCiphertext: second.ciphertext,
        expectedVersion: 1,
        id: intentId,
        now: new Date("2026-08-31T15:32:00.000Z"),
        ownerPrincipalId: principalId,
      }),
    ]);
    const successful = results.filter((result) => result.status === "fulfilled");
    const conflicts = results.filter((result) => result.status === "rejected");

    expect(successful).toHaveLength(1);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      reason: { code: "INTENT_VERSION_CONFLICT", name: "OptimisticConcurrencyError" },
    });
    const saved = await repository.findByIdForOwner(intentId, principalId);
    expect(saved?.version).toBe(2);
  });

  it("completes an immutable input snapshot that PostgreSQL refuses to rewrite", async () => {
    const principalId = "0199a72d-3f45-7df1-a730-1722c2538927";
    const subjectId = "0199a72d-3f45-7df1-a730-1722c2538928";
    const intentId = "0199a72d-3f45-7df1-a730-1722c2538929";
    const now = new Date("2026-08-31T15:33:00.000Z");
    await seedSyntheticIdentity(pool, protector, { principalId, subjectId, now });
    const draft = await protector.protect('{"step":"review"}', "report_intent_draft");
    const snapshot = await protector.protect(
      '{"subject":{"dateOfBirth":"1990-08-12"}}',
      "report_intent_snapshot",
    );
    const repository = createReportIntentRepository(pool);
    await repository.create({
      draftCiphertext: draft.ciphertext,
      expiresAt: new Date("2026-09-07T15:33:00.000Z"),
      id: intentId,
      inputSchemaVersion: "1.0.0",
      locale: "en-IN",
      now,
      ownerPrincipalId: principalId,
      subjectId,
    });

    const consentEvents = [
      {
        action: "granted",
        id: "0199a72d-3f45-7df1-a730-1722c2538930",
        noticeLocale: "en-IN",
        noticeVersion: "privacy.2026-08-31.1",
        occurredAt: new Date("2026-08-31T15:34:00.000Z"),
        purpose: "required_processing",
      },
      {
        action: "declined",
        id: "0199a72d-3f45-7df1-a730-1722c2538931",
        noticeLocale: "en-IN",
        noticeVersion: "privacy.2026-08-31.1",
        occurredAt: new Date("2026-08-31T15:34:00.000Z"),
        purpose: "analytics",
      },
      {
        action: "declined",
        id: "0199a72d-3f45-7df1-a730-1722c2538932",
        noticeLocale: "en-IN",
        noticeVersion: "privacy.2026-08-31.1",
        occurredAt: new Date("2026-08-31T15:34:00.000Z"),
        purpose: "marketing_email",
      },
    ] as const;
    const completion = {
      consentEvents,
      expectedVersion: 1,
      id: intentId,
      inputHash: Buffer.alloc(32, 0x51),
      inputSnapshotCiphertext: snapshot.ciphertext,
      noticeVersion: "privacy.2026-08-31.1",
      now: new Date("2026-08-31T15:34:00.000Z"),
      ownerPrincipalId: principalId,
      requiredConsentAt: new Date("2026-08-31T15:34:00.000Z"),
    } as const;
    await expect(
      repository.complete({ ...completion, consentEvents: consentEvents.slice(0, 2) }),
    ).rejects.toThrow("CONSENT_EVIDENCE_INVALID");
    await expect(
      pool.query("SELECT status, version FROM report_intents WHERE id = $1", [intentId]),
    ).resolves.toMatchObject({ rows: [{ status: "draft", version: 1 }] });

    const completed = await repository.complete(completion);

    expect(completed).toMatchObject({ status: "complete", version: 2 });
    await expect(
      pool.query(
        `SELECT purpose, action, notice_version, notice_locale
           FROM consent_events
          WHERE report_intent_id = $1
          ORDER BY purpose::text`,
        [intentId],
      ),
    ).resolves.toMatchObject({
      rows: [
        {
          action: "declined",
          notice_locale: "en-IN",
          notice_version: "privacy.2026-08-31.1",
          purpose: "analytics",
        },
        {
          action: "declined",
          notice_locale: "en-IN",
          notice_version: "privacy.2026-08-31.1",
          purpose: "marketing_email",
        },
        {
          action: "granted",
          notice_locale: "en-IN",
          notice_version: "privacy.2026-08-31.1",
          purpose: "required_processing",
        },
      ],
    });
    await expect(
      pool.query("UPDATE report_intents SET input_hash = $1 WHERE id = $2", [
        Buffer.alloc(32, 0x52),
        intentId,
      ]),
    ).rejects.toMatchObject({ code: "23514" });
  });
});
