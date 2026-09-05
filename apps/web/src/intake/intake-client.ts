import {
  reportIntentDraftSchema,
  reportIntentInputSchema,
  type ReportIntentInput,
  reportIntentPatchSchema,
} from "@numerology/contracts";
import type { InitialIntakeValues } from "./intake-form";
import type { IntakeLocale } from "./intake-progress";
import { needsLatinSpelling } from "./intake-validation";
import { PRIVACY_NOTICE_VERSION } from "./privacy-notice";

type Draft = ReturnType<typeof reportIntentDraftSchema.parse>;
type Patch = ReturnType<typeof reportIntentPatchSchema.parse>;
export interface SavedIntake {
  readonly draft: Draft;
  readonly intent: {
    readonly id: string;
    readonly version: number;
    readonly status: "draft" | "complete" | "preview_ready" | "checkout_created" | "converted";
    readonly locale: IntakeLocale;
  };
}
export interface IntakePreview {
  readonly locale: IntakeLocale;
  readonly values: readonly { label: string; value: string }[];
}

export class IntakeRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(
      status === 401
        ? "Sign in to save or resume your private report."
        : status === 409
          ? "This draft was saved in another tab, or a previous request is still processing. Reload the saved draft before continuing."
          : status === 429
            ? "Too many requests. Please wait a minute before trying again."
            : status === 404
              ? "This draft is unavailable or has expired. Start a new report."
              : status === 400
                ? "Please check your details, calculation spelling and privacy choices."
                : status === 503
                  ? "Secure saving is not available yet. Your answers remain in this tab; please try again later."
                  : "We could not save your details. Please try again.",
    );
  }
}
function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error("The server returned an unexpected response.");
  return value as Record<string, unknown>;
}
function parseSaved(value: unknown): SavedIntake {
  const body = object(value);
  const intent = object(body.intent);
  const draft = reportIntentDraftSchema.parse(body.draft);
  if (
    typeof intent.id !== "string" ||
    !/^[0-9a-f-]{36}$/u.test(intent.id) ||
    !Number.isSafeInteger(intent.version) ||
    Number(intent.version) < 1 ||
    typeof intent.status !== "string" ||
    !["draft", "complete", "preview_ready", "checkout_created", "converted"].includes(
      intent.status,
    ) ||
    intent.locale !== draft.locale
  )
    throw new Error("The server returned an unexpected response.");
  return {
    draft,
    intent: {
      id: intent.id,
      version: Number(intent.version),
      status: intent.status as SavedIntake["intent"]["status"],
      locale: draft.locale,
    },
  };
}
export function readIntakeCsrf(): string {
  const values = document.cookie
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith("__Host-numerology_csrf="));
  return values.length === 1 ? (values[0]?.split("=")[1] ?? "") : "";
}
/** One controller per mounted form; personal answers and retry keys stay in memory only. */
export function createIntakeClient(dependencies: {
  fetch: typeof fetch;
  csrf: () => string;
  key: () => string;
}) {
  let current: SavedIntake | undefined;
  let createKey: string | undefined;
  async function request(
    path: string,
    method: string,
    body?: unknown,
    key?: string,
  ): Promise<unknown> {
    const csrf = dependencies.csrf();
    if (method !== "GET" && !/^[A-Za-z0-9_-]{43}$/u.test(csrf))
      throw new IntakeRequestError(401, "UNAUTHENTICATED");
    const response = await dependencies.fetch(`/api/v1/report-intents${path}`, {
      method,
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(method === "GET" ? {} : { "X-CSRF-Token": csrf }),
        ...(key === undefined ? {} : { "Idempotency-Key": key }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const code =
        result && typeof result === "object" && "code" in result && typeof result.code === "string"
          ? result.code
          : "REQUEST_FAILED";
      if (code === "IDEMPOTENCY_KEY_EXPIRED") createKey = undefined;
      throw new IntakeRequestError(response.status, code);
    }
    return result;
  }
  return {
    async load(id: string) {
      if (!/^[0-9a-f-]{36}$/u.test(id)) throw new IntakeRequestError(404, "NOT_FOUND");
      current = parseSaved(await request(`/${id}`, "GET"));
      if (current.intent.id !== id) throw new Error("The server returned an unexpected response.");
      return current;
    },
    async save(locale: IntakeLocale, patch: Patch) {
      if (current === undefined) {
        createKey ??= dependencies.key();
        current = parseSaved(await request("", "POST", { locale }, createKey));
      }
      current = parseSaved(
        await request(`/${current.intent.id}`, "PATCH", {
          expectedVersion: current.intent.version,
          patch,
        }),
      );
      return current;
    },
    async complete(input: unknown) {
      if (!current) throw new IntakeRequestError(404, "NOT_FOUND");
      current = parseSaved(
        await request(`/${current.intent.id}/complete`, "POST", {
          input,
          expectedVersion: current.intent.version,
        }),
      );
      return current;
    },
    async preview(): Promise<IntakePreview> {
      if (!current) throw new IntakeRequestError(404, "NOT_FOUND");
      const result = object(await request(`/${current.intent.id}/preview`, "POST", {}));
      if (
        result.locale !== current.intent.locale ||
        !Array.isArray(result.values) ||
        result.values.length !== 3
      )
        throw new Error("The server returned an unexpected response.");
      const values = result.values.map((item: unknown) => {
        const value = object(item);
        if (
          typeof value.label !== "string" ||
          value.label.length > 80 ||
          typeof value.value !== "string" ||
          value.value.length > 80
        )
          throw new Error("The server returned an unexpected response.");
        return { label: value.label, value: value.value };
      });
      return { locale: current.intent.locale, values };
    },
  };
}

export function valuesToPatch(values: InitialIntakeValues, locale: IntakeLocale): Patch {
  const names = (["birthName", "currentName"] as const).flatMap((field) => {
    const value = values[field]?.trim();
    if (!value) return [];
    const latin = values[`${field}EngineLatin`];
    return [
      {
        kind: field === "birthName" ? ("birth_full" as const) : ("current_full" as const),
        value,
        locale,
        yClassifications: values[`${field}YClassifications`] ?? {},
        ...(needsLatinSpelling(value) && latin
          ? {
              engineLatin: latin,
              ...(values[`${field}EngineLatinConfirmed`] === true
                ? { engineLatinConfirmed: true as const }
                : {}),
              engineLatinVersion: "1.0.0",
            }
          : {}),
      },
    ];
  });
  return reportIntentPatchSchema.parse({
    locale,
    subject: {
      ...(names.length ? { names } : {}),
      ...(values.dateOfBirth ? { dateOfBirth: values.dateOfBirth } : {}),
    },
    ...(values.email ? { delivery: { email: values.email } } : {}),
    ...(values.consent
      ? {
          consents: {
            requiredProcessing: true,
            analytics: values.analyticsConsent ?? false,
            marketingEmail: values.marketingConsent ?? false,
            noticeVersion: PRIVACY_NOTICE_VERSION,
          },
        }
      : {}),
  });
}
export function valuesToInput(
  values: InitialIntakeValues,
  locale: IntakeLocale,
): ReportIntentInput {
  return reportIntentInputSchema.parse({
    ...valuesToPatch(values, locale),
    locale,
    schemaVersion: "1.0.0",
  });
}
export function draftToValues(draft: Draft): InitialIntakeValues {
  const birth = draft.subject?.names?.find((name) => name.kind === "birth_full");
  const current = draft.subject?.names?.find(
    (name) => name.kind === "current_full" || name.kind === "popular",
  );
  return {
    birthName: birth?.value ?? "",
    currentName: current?.value ?? "",
    birthNameEngineLatin: birth?.engineLatin ?? "",
    birthNameEngineLatinConfirmed: birth?.engineLatinConfirmed ?? false,
    currentNameEngineLatin: current?.engineLatin ?? "",
    currentNameEngineLatinConfirmed: current?.engineLatinConfirmed ?? false,
    birthNameYClassifications: birth?.yClassifications ?? draft.subject?.yClassifications ?? {},
    currentNameYClassifications: current?.yClassifications ?? draft.subject?.yClassifications ?? {},
    dateOfBirth: draft.subject?.dateOfBirth ?? "",
    email: draft.delivery?.email ?? "",
    consent:
      draft.consents?.requiredProcessing === true &&
      draft.consents.noticeVersion === PRIVACY_NOTICE_VERSION,
    analyticsConsent: draft.consents?.analytics ?? false,
    marketingConsent: draft.consents?.marketingEmail ?? false,
  };
}
