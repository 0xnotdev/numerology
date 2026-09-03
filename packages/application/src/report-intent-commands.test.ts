import { describe, expect, it } from "vitest";
import type {
  CompleteReportIntent,
  FieldProtector,
  ProtectedField,
  ReportIntentRecord,
  ReportIntentRepository,
} from "./index";
import { createReportIntentCommands } from "./report-intent-commands";

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
        subjectId: input.subjectId,
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
    let now = NOW;
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
            },
            {
              kind: "popular",
              locale: "hi-IN",
              value: "श्रेया",
              engineLatin: "Shreya",
              engineLatinConfirmed: true,
              engineLatinVersion: "1.0.0",
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
});
