import {
  normalizeReportIntentInput,
  REPORT_INTENT_SNAPSHOT_SCHEMA_VERSION,
  type ReportIntentInput,
  reportIntentDraftSchema,
  reportIntentPatchSchema,
  reportIntentSnapshotSchema,
} from "@numerology/contracts";
import {
  type CalculationRequest,
  calculateBundle,
  canonicalHash,
  PROFILE_IDS,
} from "@numerology/engine";
import { deepFreeze } from "@numerology/shared";
import type { Clock } from "./clock";
import type { FieldProtector } from "./field-protection";
import type { IdGenerator } from "./id-generator";
import type {
  CompleteReportIntent,
  ReportIntentRecord,
  ReportIntentRepository,
  SaveReportIntentDraft,
  SupportedLocale,
} from "./report-intent-repository";
import { OptimisticConcurrencyError, ReportIntentNotFoundError } from "./report-intent-repository";

const DRAFT_EXPIRY_MS = 7 * 24 * 60 * 60 * 1_000;
const DRAFT_PURPOSE = "report_intent_draft" as const;
const SNAPSHOT_PURPOSE = "report_intent_snapshot" as const;

type ReportIntentDraft = ReturnType<typeof reportIntentDraftSchema.parse>;
type ReportIntentPatch = ReturnType<typeof reportIntentPatchSchema.parse>;

export interface ReportIntentCommandDependencies {
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly protector: FieldProtector;
  readonly repository: ReportIntentRepository;
}

export interface CreateReportIntentCommandInput {
  /** Stable id derived from the request idempotency key; omitted for non-HTTP callers. */
  readonly id?: string;
  readonly locale: SupportedLocale;
  readonly ownerPrincipalId: string;
  readonly subjectId?: string;
}

export interface OwnedIntentInput {
  readonly id: string;
  readonly ownerPrincipalId: string;
}

export interface PatchReportIntentCommandInput extends OwnedIntentInput {
  readonly expectedVersion: number;
  readonly patch: unknown;
}

export interface CompleteReportIntentCommandInput extends OwnedIntentInput {
  readonly expectedVersion?: number;
  readonly input: unknown;
}

export type PreviewReportIntentCommandInput = OwnedIntentInput;

export interface IntentReadResult {
  readonly draft: ReportIntentDraft;
  readonly record: ReportIntentRecord;
}

export interface ReportPreview {
  readonly locale: SupportedLocale;
  readonly values: readonly { label: string; value: string }[];
}

function assertOwner(value: string, label: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new RangeError(`${label} is required.`);
  }
}

function encodeHash(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function asOfDateFromDate(now: Date): string {
  return new Date(now.valueOf() + 330 * 60_000).toISOString().slice(0, 10);
}

function mergeDraft(existing: ReportIntentDraft, patch: ReportIntentPatch): ReportIntentDraft {
  const merged = {
    ...existing,
    ...patch,
    ...(existing.subject === undefined && patch.subject === undefined
      ? {}
      : { subject: { ...existing.subject, ...patch.subject } }),
  };
  return reportIntentDraftSchema.parse(merged);
}

function parseDraft(plaintext: string): ReportIntentDraft {
  try {
    return reportIntentDraftSchema.parse(JSON.parse(plaintext) as unknown);
  } catch {
    throw new RangeError("INTENT_DRAFT_INVALID");
  }
}

function parseSnapshot(plaintext: string) {
  try {
    return reportIntentSnapshotSchema.parse(JSON.parse(plaintext) as unknown);
  } catch {
    throw new RangeError("INTENT_SNAPSHOT_INVALID");
  }
}

async function requiredRecord(
  repository: ReportIntentRepository,
  id: string,
  ownerPrincipalId: string,
): Promise<ReportIntentRecord> {
  const record = await repository.findByIdForOwner(id, ownerPrincipalId);
  if (record === null) {
    throw new ReportIntentNotFoundError();
  }
  return record;
}

function calculationRequest(input: ReportIntentInput, asOfDate: string): CalculationRequest {
  return {
    asOfDate,
    civilDate: input.subject.dateOfBirth,
    names: input.subject.names.map((name, index) => {
      const calculationText = (name.engineLatin ?? name.value)
        .normalize("NFC")
        .trim()
        .replace(/\s+/gu, " ");
      if (!/^[A-Za-z '\u2019\u02bc.\-]+$/u.test(calculationText)) {
        throw new RangeError("LATIN_CALCULATION_SPELLING_REQUIRED");
      }
      const yClassifications = name.yClassifications ?? input.subject.yClassifications;
      for (const [position, letter] of Array.from(calculationText.toUpperCase()).entries()) {
        if (letter === "Y" && yClassifications[String(position)] === undefined) {
          throw new RangeError("Y_CLASSIFICATION_REQUIRED");
        }
      }
      return {
        calculationText,
        id: `${name.kind}-${index + 1}`,
        kind: name.kind,
        ...(name.locale === undefined ? {} : { locale: name.locale }),
        ...(name.engineLatin === undefined
          ? {}
          : {
              transliteration: {
                scheme: "customer-latin-engine",
                userConfirmed: true as const,
                version: name.engineLatinVersion as string,
              },
            }),
        value: name.value,
        yClassifications,
      };
    }),
    profiles: PROFILE_IDS,
    schemaVersion: "1.0.0",
  };
}

function assertRequiredNameViews(input: ReportIntentInput): void {
  const kinds = new Set(input.subject.names.map((name) => name.kind));
  if (!kinds.has("birth_full")) {
    throw new RangeError("A birth name is required before completion.");
  }
  if (!kinds.has("popular") && !kinds.has("current_full")) {
    throw new RangeError("A current or popular name is required before completion.");
  }
}

/** Application boundary for encrypted intent lifecycle and deterministic preview. */
export function createReportIntentCommands(dependencies: ReportIntentCommandDependencies) {
  async function read(input: OwnedIntentInput): Promise<IntentReadResult> {
    assertOwner(input.id, "Intent id");
    assertOwner(input.ownerPrincipalId, "Owner principal");
    const record = await requiredRecord(dependencies.repository, input.id, input.ownerPrincipalId);
    if (
      record.expiresAt.valueOf() <= dependencies.clock.now().valueOf() ||
      record.status === "expired"
    )
      throw new ReportIntentNotFoundError();
    const plaintext = await dependencies.protector.reveal(record.draftCiphertext, DRAFT_PURPOSE);
    return { draft: parseDraft(plaintext), record };
  }

  return {
    async create(input: CreateReportIntentCommandInput): Promise<IntentReadResult> {
      assertOwner(input.ownerPrincipalId, "Owner principal");
      if (input.subjectId !== undefined) assertOwner(input.subjectId, "Subject id");
      const now = dependencies.clock.now();
      const draft = reportIntentDraftSchema.parse({ locale: input.locale, schemaVersion: "1.0.0" });
      const protectedDraft = await dependencies.protector.protect(
        JSON.stringify(draft),
        DRAFT_PURPOSE,
      );
      const record = await dependencies.repository.create({
        draftCiphertext: protectedDraft.ciphertext,
        expiresAt: new Date(now.valueOf() + DRAFT_EXPIRY_MS),
        id: input.id ?? dependencies.idGenerator.next(),
        inputSchemaVersion: "1.0.0",
        locale: input.locale,
        now,
        ownerPrincipalId: input.ownerPrincipalId,
        ...(input.subjectId === undefined ? {} : { subjectId: input.subjectId }),
      });
      return { draft, record };
    },

    get: read,

    async patch(input: PatchReportIntentCommandInput): Promise<IntentReadResult> {
      const current = await read(input);
      if (current.record.status !== "draft") {
        throw new RangeError("INTENT_NOT_EDITABLE");
      }
      const patch = reportIntentPatchSchema.parse(input.patch);
      const draft = mergeDraft(current.draft, patch);
      const protectedDraft = await dependencies.protector.protect(
        JSON.stringify(draft),
        DRAFT_PURPOSE,
      );
      const saveInput: SaveReportIntentDraft = {
        draftCiphertext: protectedDraft.ciphertext,
        expectedVersion: input.expectedVersion,
        id: input.id,
        now: dependencies.clock.now(),
        ownerPrincipalId: input.ownerPrincipalId,
      };
      const record = await dependencies.repository.saveDraft(saveInput);
      return { draft, record };
    },

    async complete(input: CompleteReportIntentCommandInput): Promise<IntentReadResult> {
      const current = await read(input);
      if (input.expectedVersion !== undefined && input.expectedVersion !== current.record.version) {
        throw new OptimisticConcurrencyError();
      }
      if (current.record.status !== "draft") {
        throw new RangeError("INTENT_NOT_EDITABLE");
      }
      const now = dependencies.clock.now();
      const asOfDate = asOfDateFromDate(now);
      const normalized = normalizeReportIntentInput(input.input, asOfDate);
      if (normalized.locale !== current.record.locale) {
        throw new RangeError("INTENT_LOCALE_MISMATCH");
      }
      assertRequiredNameViews(normalized);
      const request = calculationRequest(normalized, asOfDate);
      // Calculate at completion to ensure all required engine input is valid before snapshotting.
      calculateBundle(request);
      const snapshot = await dependencies.protector.protect(
        JSON.stringify({
          asOfDate,
          input: normalized,
          schemaVersion: REPORT_INTENT_SNAPSHOT_SCHEMA_VERSION,
        }),
        SNAPSHOT_PURPOSE,
      );
      const savedDraft = await dependencies.protector.protect(
        JSON.stringify(normalized),
        DRAFT_PURPOSE,
      );
      const subjectBirth =
        current.record.subjectId === null
          ? await dependencies.protector.protect(
              normalized.subject.dateOfBirth,
              "subject_date_of_birth",
            )
          : null;
      const completeInput: CompleteReportIntent = {
        draftCiphertext: savedDraft.ciphertext,
        ...(subjectBirth === null
          ? {}
          : {
              subject: {
                id: dependencies.idGenerator.next(),
                dateOfBirthCiphertext: subjectBirth.ciphertext,
                keyVersion: subjectBirth.keyVersion,
                purgeAfter: current.record.expiresAt,
              },
            }),
        consentEvents: [
          {
            action: "granted",
            id: dependencies.idGenerator.next(),
            noticeLocale: normalized.locale,
            noticeVersion: normalized.consents.noticeVersion,
            occurredAt: now,
            purpose: "required_processing",
          },
          {
            action: normalized.consents.analytics ? "granted" : "declined",
            id: dependencies.idGenerator.next(),
            noticeLocale: normalized.locale,
            noticeVersion: normalized.consents.noticeVersion,
            occurredAt: now,
            purpose: "analytics",
          },
          {
            action: normalized.consents.marketingEmail ? "granted" : "declined",
            id: dependencies.idGenerator.next(),
            noticeLocale: normalized.locale,
            noticeVersion: normalized.consents.noticeVersion,
            occurredAt: now,
            purpose: "marketing_email",
          },
        ],
        expectedVersion: current.record.version,
        id: input.id,
        inputHash: encodeHash(canonicalHash(normalized)),
        inputSnapshotCiphertext: snapshot.ciphertext,
        noticeVersion: normalized.consents.noticeVersion,
        now,
        ownerPrincipalId: input.ownerPrincipalId,
        requiredConsentAt: now,
      };
      const record = await dependencies.repository.complete(completeInput);
      return { draft: reportIntentDraftSchema.parse(normalized), record };
    },

    async preview(input: PreviewReportIntentCommandInput): Promise<ReportPreview> {
      const current = await read(input);
      if (current.record.status !== "complete" && current.record.status !== "preview_ready") {
        throw new RangeError("INTENT_NOT_COMPLETE");
      }
      const snapshot = parseSnapshot(
        await dependencies.protector.reveal(
          current.record.inputSnapshotCiphertext ?? new Uint8Array(),
          SNAPSHOT_PURPOSE,
        ),
      );
      const normalized = normalizeReportIntentInput(snapshot.input, snapshot.asOfDate);
      const bundle = calculateBundle(calculationRequest(normalized, snapshot.asOfDate));
      const labels = [
        ["life_path", "Life path"],
        ["expression", "Expression"],
        ["personal_year", "Personal year"],
      ] as const;
      const values = labels.map(([metricId, label]) => {
        const fact = bundle.facts.find((candidate) => candidate.metricId === metricId);
        if (fact === undefined) {
          throw new RangeError("PREVIEW_VALUE_UNAVAILABLE");
        }
        return { label, value: fact.displayTokens.join(" · ") };
      });
      return deepFreeze({ locale: normalized.locale, values });
    },
  };
}

export { OptimisticConcurrencyError };
