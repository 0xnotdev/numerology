import { describe, expect, it } from "vitest";
import type {
  CompleteReportIntent,
  FieldProtector,
  ProtectedField,
  ReportIntentRecord,
  ReportIntentRepository,
} from "./index";
import { createReportIntentCommands } from "./report-intent-commands";
import { OptimisticConcurrencyError } from "./report-intent-repository";

const NOW = new Date("2026-09-03T00:00:00.000Z");
const OWNER = "00000000-0000-4000-8000-000000000001";
const SUBJECT = "00000000-0000-4000-8000-000000000002";

function protector(): FieldProtector {
  return {
    async lookup() {
      return new Uint8Array([1]);
    },
    async protect(plaintext, purpose): Promise<ProtectedField> {
      return {
        ciphertext: new TextEncoder().encode(`${purpose}:${plaintext}`),
        formatVersion: 1,
        keyId: "test",
        keyVersion: 1,
      };
    },
    async reveal(field): Promise<string> {
      const text = new TextDecoder().decode(field instanceof Uint8Array ? field : field.ciphertext);
      return text.slice(text.indexOf(":") + 1);
    },
  };
}

function repository(): ReportIntentRepository & {
  completion: CompleteReportIntent | null;
  record: ReportIntentRecord | null;
} {
  let completion: CompleteReportIntent | null = null;
  let record: ReportIntentRecord | null = null;
  return {
    get completion() {
      return completion;
    },
    get record() {
      return record;
    },
    set record(value) {
      record = value;
    },
    async create(input) {
      record = {
        createdAt: input.now,
        draftCiphertext: input.draftCiphertext,
        expiresAt: input.expiresAt,
        id: input.id,
        inputHash: null,
        inputSchemaVersion: input.inputSchemaVersion,
        inputSnapshotCiphertext: null,
        locale: input.locale,
        noticeVersion: null,
        ownerPrincipalId: input.ownerPrincipalId,
        requiredConsentAt: null,
        status: "draft",
        subjectId: input.subjectId ?? null,
        updatedAt: input.now,
        version: 1,
      };
      return record;
    },
    async findByIdForOwner(id, ownerPrincipalId) {
      return record?.id === id && record.ownerPrincipalId === ownerPrincipalId ? record : null;
    },
    async saveDraft(input) {
      if (record === null || record.version !== input.expectedVersion)
        throw new Error("INTENT_VERSION_CONFLICT");
      record = {
        ...record,
        draftCiphertext: input.draftCiphertext,
        updatedAt: input.now,
        version: record.version + 1,
      };
      return record;
    },
    async complete(input) {
      if (record === null || record.version !== input.expectedVersion)
        throw new Error("INTENT_VERSION_CONFLICT");
      completion = input;
      record = {
        ...record,
        inputHash: input.inputHash,
        inputSnapshotCiphertext: input.inputSnapshotCiphertext,
        noticeVersion: input.noticeVersion,
        requiredConsentAt: input.requiredConsentAt,
        status: "complete",
        updatedAt: input.now,
        version: record.version + 1,
      };
      return record;
    },
    async expireDueDrafts() {
      return 0;
    },
  };
}

const completeInput = {
  consents: {
    analytics: true,
    marketingEmail: false,
    noticeVersion: "privacy-v1",
    requiredProcessing: true,
  },
  delivery: { email: "person@example.com" },
  locale: "en-IN",
  schemaVersion: "1.0.0",
  subject: {
    dateOfBirth: "1990-08-12",
    names: [
      { kind: "birth_full", value: "Thomas Cruise" },
      { kind: "popular", value: "Tom Cruise" },
    ],
  },
} as const;

describe("report intent application commands", () => {
  it("creates, reads, patches, completes, and previews through injected ports", async () => {
    const repo = repository();
    const commands = createReportIntentCommands({
      clock: { now: () => NOW },
      idGenerator: { next: () => "00000000-0000-4000-8000-000000000003" },
      protector: protector(),
      repository: repo,
    });
    const created = await commands.create({
      locale: "en-IN",
      ownerPrincipalId: OWNER,
      subjectId: SUBJECT,
    });
    expect(created.record.version).toBe(1);
    const read = await commands.get({ id: created.record.id, ownerPrincipalId: OWNER });
    expect(read.draft).toMatchObject({ locale: "en-IN", schemaVersion: "1.0.0" });
    const patched = await commands.patch({
      id: created.record.id,
      ownerPrincipalId: OWNER,
      expectedVersion: 1,
      patch: { delivery: completeInput.delivery },
    });
    expect(patched.record.version).toBe(2);
    const completed = await commands.complete({
      id: created.record.id,
      input: completeInput,
      ownerPrincipalId: OWNER,
    });
    expect(completed.record.status).toBe("complete");
    expect(
      repo.completion?.consentEvents.map(({ action, purpose }) => ({ action, purpose })),
    ).toEqual([
      { action: "granted", purpose: "required_processing" },
      { action: "granted", purpose: "analytics" },
      { action: "declined", purpose: "marketing_email" },
    ]);
    expect(repo.completion?.consentEvents.every((event) => event.noticeLocale === "en-IN")).toBe(
      true,
    );
    const preview = await commands.preview({
      id: created.record.id,
      ownerPrincipalId: OWNER,
    });
    expect(preview.locale).toBe("en-IN");
    expect(preview.values.length).toBe(3);
    const previewText = JSON.stringify(preview);
    expect(previewText).not.toMatch(/factId|profile|confidence|rank/iu);
    expect(previewText).not.toContain("person@example.com");
    expect(previewText).not.toContain("Thomas Cruise");
    expect(previewText).not.toContain("Tom Cruise");
    expect(previewText).not.toContain("1990-08-12");
  });

  it("rejects stale patches and incomplete/underage completion", async () => {
    const repo = repository();
    const commands = createReportIntentCommands({
      clock: { now: () => NOW },
      idGenerator: { next: () => "00000000-0000-4000-8000-000000000003" },
      protector: protector(),
      repository: repo,
    });
    const created = await commands.create({
      locale: "en-IN",
      ownerPrincipalId: OWNER,
      subjectId: SUBJECT,
    });
    await expect(
      commands.patch({
        id: created.record.id,
        ownerPrincipalId: OWNER,
        expectedVersion: 9,
        patch: {},
      }),
    ).rejects.toThrow();
    await expect(
      commands.complete({
        id: created.record.id,
        input: {
          ...completeInput,
          subject: { ...completeInput.subject, dateOfBirth: "2010-01-01" },
        },
        ownerPrincipalId: OWNER,
      }),
    ).rejects.toThrow("at least 18");
  });

  it("keeps preview values stable when the wall clock crosses into a new year", async () => {
    let now = new Date("2026-12-31T17:00:00.000Z");
    const repo = repository();
    const commands = createReportIntentCommands({
      clock: { now: () => now },
      idGenerator: { next: () => "00000000-0000-4000-8000-000000000003" },
      protector: protector(),
      repository: repo,
    });
    const created = await commands.create({
      locale: "en-IN",
      ownerPrincipalId: OWNER,
      subjectId: SUBJECT,
    });
    await commands.complete({
      id: created.record.id,
      input: completeInput,
      ownerPrincipalId: OWNER,
    });
    const beforeRollover = await commands.preview({
      id: created.record.id,
      ownerPrincipalId: OWNER,
    });
    now = new Date("2027-01-01T00:00:00.000Z");
    const afterRollover = await commands.preview({
      id: created.record.id,
      ownerPrincipalId: OWNER,
    });
    expect(afterRollover).toEqual(beforeRollover);
  });

  it("keeps a non-Latin display name while sending the confirmed Latin spelling to the engine", async () => {
    const repo = repository();
    const commands = createReportIntentCommands({
      clock: { now: () => NOW },
      idGenerator: { next: () => "00000000-0000-4000-8000-000000000003" },
      protector: protector(),
      repository: repo,
    });
    const created = await commands.create({
      locale: "en-IN",
      ownerPrincipalId: OWNER,
      subjectId: SUBJECT,
    });
    await commands.complete({
      id: created.record.id,
      input: {
        ...completeInput,
        subject: {
          ...completeInput.subject,
          names: [
            {
              kind: "birth_full",
              locale: "hi-IN",
              value: "श्रेया  पटनायक",
              engineLatin: "Shreya   Patnaik",
              engineLatinConfirmed: true,
              engineLatinVersion: "1.0.0",
              yClassifications: { "4": "consonant" },
            },
            {
              kind: "popular",
              locale: "hi-IN",
              value: "श्रेया",
              engineLatin: "Shreya",
              engineLatinConfirmed: true,
              engineLatinVersion: "1.0.0",
              yClassifications: { "4": "consonant" },
            },
          ],
        },
      },
      ownerPrincipalId: OWNER,
    });
    const snapshotText = new TextDecoder().decode(
      repo.record?.inputSnapshotCiphertext ?? new Uint8Array(),
    );
    expect(snapshotText).toContain('"value":"श्रेया  पटनायक"');
    expect(snapshotText).toContain('"engineLatin":"Shreya Patnaik"');
  });

  it("uses India midnight for adult eligibility and the authoritative snapshot date", async () => {
    let now = new Date("2026-12-31T18:29:59.999Z");
    const repo = repository();
    const commands = createReportIntentCommands({
      clock: { now: () => now },
      idGenerator: { next: () => SUBJECT },
      protector: protector(),
      repository: repo,
    });
    const created = await commands.create({ locale: "en-IN", ownerPrincipalId: OWNER });
    const input = {
      ...completeInput,
      subject: { ...completeInput.subject, dateOfBirth: "2009-01-01" },
    };
    const owned = { id: created.record.id, ownerPrincipalId: OWNER };
    await expect(commands.complete({ ...owned, expectedVersion: 1, input })).rejects.toThrow(
      "at least 18",
    );
    now = new Date("2026-12-31T18:30:00.000Z");
    await commands.complete({ ...owned, expectedVersion: 1, input });
    const snapshot = JSON.parse(
      await protector().reveal(
        repo.completion?.inputSnapshotCiphertext ?? new Uint8Array(),
        "report_intent_snapshot",
      ),
    );
    expect(snapshot.asOfDate).toBe("2027-01-01");
    const preview = await commands.preview(owned);
    now = new Date("2027-01-01T18:30:00.000Z");
    expect(await commands.preview(owned)).toEqual(preview);
  });

  it("rejects stale completion without persisting a snapshot or consent", async () => {
    const repo = repository();
    const commands = createReportIntentCommands({
      clock: { now: () => NOW },
      idGenerator: { next: () => SUBJECT },
      protector: protector(),
      repository: repo,
    });
    const created = await commands.create({ locale: "en-IN", ownerPrincipalId: OWNER });
    const owned = { id: created.record.id, ownerPrincipalId: OWNER };
    await commands.patch({
      ...owned,
      expectedVersion: 1,
      patch: { delivery: completeInput.delivery },
    });
    await expect(
      commands.complete({ ...owned, expectedVersion: 1, input: completeInput }),
    ).rejects.toThrow(OptimisticConcurrencyError);
    expect(repo.completion).toBeNull();
    expect(repo.record?.status).toBe("draft");
    await expect(
      commands.complete({ ...owned, expectedVersion: 2, input: completeInput }),
    ).resolves.toMatchObject({ record: { status: "complete" } });
  });

  it("requires every Y decision and preserves independent same-index policies for each name", async () => {
    const repo = repository();
    const commands = createReportIntentCommands({
      clock: { now: () => NOW },
      idGenerator: { next: () => SUBJECT },
      protector: protector(),
      repository: repo,
    });
    const created = await commands.create({ locale: "en-IN", ownerPrincipalId: OWNER });
    const owned = { id: created.record.id, ownerPrincipalId: OWNER };
    const input = {
      ...completeInput,
      subject: {
        ...completeInput.subject,
        names: [
          {
            kind: "birth_full",
            value: "Lynn Ray",
            yClassifications: { "1": "vowel", "7": "consonant" },
          },
          {
            kind: "current_full",
            value: "Kyra Roy",
            yClassifications: { "1": "consonant", "7": "vowel" },
          },
        ],
      },
    };
    await expect(
      commands.complete({
        ...owned,
        input: {
          ...input,
          subject: {
            ...input.subject,
            names: [
              input.subject.names[0],
              { kind: "current_full", value: "Kyra Roy", yClassifications: { "1": "consonant" } },
            ],
          },
        },
      }),
    ).rejects.toThrow();
    expect(repo.completion).toBeNull();
    const completed = await commands.complete({ ...owned, input });
    expect(completed.draft.subject?.names).toEqual(input.subject.names);
    const snapshot = JSON.parse(
      await protector().reveal(
        repo.completion?.inputSnapshotCiphertext ?? new Uint8Array(),
        "report_intent_snapshot",
      ),
    );
    expect(snapshot.input.subject.names[0].yClassifications).toEqual({
      "1": "vowel",
      "7": "consonant",
    });
    expect(snapshot.input.subject.names[1].yClassifications).toEqual({
      "1": "consonant",
      "7": "vowel",
    });
  });
});
