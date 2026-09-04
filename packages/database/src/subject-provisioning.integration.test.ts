import { createReportIntentCommands, LocalEnvelopeFieldProtector } from "@numerology/application";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, expect, it } from "vitest";
import {
  createDatabasePool,
  createPostgresRateLimiter,
  createReportIntentRepository,
  runMigrations,
} from "./index";
import { resetTestDatabase, seedSyntheticIdentity } from "./test-support";
const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://numerology:numerology@127.0.0.1:5432/numerology_test";
const pool = createDatabasePool({ connectionString });
const protector = new LocalEnvelopeFieldProtector({
  keyEncryptionKey: Buffer.alloc(32, 0x21),
  lookupKey: Buffer.alloc(32, 0x22),
  keyId: "subject-test",
});
beforeAll(async () => {
  await resetTestDatabase(pool, connectionString);
  await runMigrations(pool);
});
afterAll(() => pool.end());
it("creates an empty owned draft without fabricated personal data and provisions an encrypted subject on completion", async () => {
  const now = new Date(Date.now() - 8 * 86_400_000);
  const ownerPrincipalId = randomUUID();
  await seedSyntheticIdentity(pool, protector, {
    principalId: ownerPrincipalId,
    subjectId: randomUUID(),
    now,
  });
  const commands = createReportIntentCommands({
    clock: { now: () => now },
    idGenerator: { next: randomUUID },
    protector,
    repository: createReportIntentRepository(pool),
  });
  const draft = await commands.create({ ownerPrincipalId, locale: "en-IN" });
  expect(draft.record.subjectId).toBeNull();
  const input = {
    schemaVersion: "1.0.0",
    locale: "en-IN",
    delivery: { email: "person@example.invalid" },
    consents: {
      requiredProcessing: true,
      analytics: false,
      marketingEmail: false,
      noticeVersion: "privacy-v1",
    },
    subject: {
      dateOfBirth: "1990-08-12",
      names: [
        { kind: "birth_full", value: "Thomas Cruise" },
        { kind: "current_full", value: "Tom Cruise" },
      ],
      yClassifications: {},
    },
  };
  const completed = await commands.complete({ id: draft.record.id, ownerPrincipalId, input });
  expect(completed.record.subjectId).toBeTruthy();
  expect(
    (await commands.get({ id: draft.record.id, ownerPrincipalId })).draft.subject?.dateOfBirth,
  ).toBe("1990-08-12");
  const subject = await pool.query<{ date_of_birth_ciphertext: Buffer; purge_after: Date }>(
    "SELECT date_of_birth_ciphertext, purge_after FROM subjects WHERE id = $1 AND owner_principal_id = $2",
    [completed.record.subjectId, ownerPrincipalId],
  );
  expect(subject.rows[0]?.date_of_birth_ciphertext.includes(Buffer.from("1990-08-12"))).toBe(false);
  expect(
    await protector.reveal(
      subject.rows[0]?.date_of_birth_ciphertext ?? new Uint8Array(),
      "subject_date_of_birth",
    ),
  ).toBe("1990-08-12");
  expect(subject.rows[0]?.purge_after).toEqual(completed.record.expiresAt);
  const preview = await commands.preview({ id: draft.record.id, ownerPrincipalId });
  expect(preview.values).toHaveLength(3);
  const later = new Date();
  const expired = await createReportIntentRepository(pool).expireDueDrafts({
    before: later,
    now: later,
    limit: 10,
    tombstoneCiphertext: new Uint8Array([0]),
  });
  expect(expired).toBe(1);
  const erased = await pool.query(
    "SELECT input_snapshot_ciphertext, input_hash, draft_ciphertext FROM report_intents WHERE id=$1",
    [draft.record.id],
  );
  expect(erased.rows[0]?.input_snapshot_ciphertext).toBeNull();
  expect(erased.rows[0]?.input_hash).toBeNull();
  expect(erased.rows[0]?.draft_ciphertext).toEqual(Buffer.from([0]));
  const subjectErased = await pool.query(
    "SELECT date_of_birth_ciphertext FROM subjects WHERE id=$1",
    [completed.record.subjectId],
  );
  expect(subjectErased.rows[0]?.date_of_birth_ciphertext).toEqual(Buffer.alloc(0));
  expect(
    (
      await pool.query(
        "SELECT count(*)::int AS count FROM consent_events WHERE report_intent_id=$1",
        [draft.record.id],
      )
    ).rows[0]?.count,
  ).toBe(3);
});

it("rolls back a newly provisioned subject when consent persistence fails", async () => {
  const now = new Date();
  const ownerPrincipalId = randomUUID();
  await seedSyntheticIdentity(pool, protector, {
    principalId: ownerPrincipalId,
    subjectId: randomUUID(),
    now,
  });
  const duplicate = randomUUID();
  const commands = createReportIntentCommands({
    clock: { now: () => now },
    idGenerator: { next: () => duplicate },
    protector,
    repository: createReportIntentRepository(pool),
  });
  const draft = await commands.create({ id: randomUUID(), ownerPrincipalId, locale: "en-IN" });
  await expect(
    commands.complete({
      id: draft.record.id,
      ownerPrincipalId,
      expectedVersion: 1,
      input: {
        schemaVersion: "1.0.0",
        locale: "en-IN",
        delivery: { email: "person@example.invalid" },
        consents: { requiredProcessing: true, noticeVersion: "test-v1" },
        subject: {
          dateOfBirth: "1990-08-12",
          names: [
            { kind: "birth_full", value: "Anita Rao" },
            { kind: "current_full", value: "Anita Rao" },
          ],
        },
      },
    }),
  ).rejects.toThrow();
  expect(
    (await commands.get({ id: draft.record.id, ownerPrincipalId })).record.subjectId,
  ).toBeNull();
  expect(
    (await pool.query("SELECT count(*)::int AS count FROM subjects WHERE id=$1", [duplicate]))
      .rows[0]?.count,
  ).toBe(0);
  expect(
    (
      await pool.query(
        "SELECT count(*)::int AS count FROM consent_events WHERE report_intent_id=$1",
        [draft.record.id],
      )
    ).rows[0]?.count,
  ).toBe(0);
});

it("enforces one shared request budget across competing PostgreSQL clients", async () => {
  const limiter = createPostgresRateLimiter(pool);
  const key = `synthetic:${randomUUID()}`;
  const decisions = await Promise.all(
    Array.from({ length: 20 }, () => limiter.consume(key, 5, 60_000)),
  );
  expect(decisions.filter((decision) => decision.allowed)).toHaveLength(5);
  expect(
    decisions
      .filter((decision) => !decision.allowed)
      .every((decision) => decision.retryAfterSeconds > 0),
  ).toBe(true);
  await pool.query(
    "UPDATE shared_rate_limits SET window_started_at = clock_timestamp() - interval '2 minutes' WHERE key=$1",
    [key],
  );
  expect((await createPostgresRateLimiter(pool).consume(key, 5, 60_000)).allowed).toBe(true);
});
