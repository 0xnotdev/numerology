import { readIntakeCsrf } from "../intake/intake-client";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const locales = new Set(["en-IN", "hi-IN", "or-IN"]);
export interface AccountReport {
  readonly id: string;
  readonly locale: "en-IN" | "hi-IN" | "or-IN";
  readonly readyAt: string;
  readonly status: "ready";
  readonly title: string;
}
export interface CustomerPractice {
  readonly availability: "available" | "unavailable";
  readonly label: string;
  readonly instruction?: string;
  readonly message?: string;
  readonly optional: true;
  readonly noPromisedResult: true;
}
export type CustomerBlock =
  | { readonly type: "prose"; readonly paragraphs: readonly string[] }
  | { readonly type: "number_card"; readonly caption: string; readonly value: string }
  | {
      readonly type: "comparison";
      readonly body: string;
      readonly left: { label: string; value: string };
      readonly right: { label: string; value: string };
    }
  | {
      readonly type: "lo_shu";
      readonly caption: string;
      readonly grid: readonly { digit: number; count: number }[];
    }
  | { readonly type: "timeline"; readonly items: readonly { label: string; value: string }[] }
  | { readonly type: "source_note"; readonly body: string };
export interface CustomerReport {
  readonly disclaimer: string;
  readonly displayName: string;
  readonly locale: "en-IN" | "hi-IN" | "or-IN";
  readonly practicalAlternatives: readonly CustomerPractice[];
  readonly sections: readonly {
    order: number;
    title: string;
    dek?: string;
    blocks: readonly CustomerBlock[];
  }[];
  readonly title: string;
  readonly traditionalPractices: readonly CustomerPractice[];
}
export interface LifecycleRequestReceipt {
  readonly action: "correction" | "export" | "deletion";
  readonly id: string;
  readonly requestedAt: string;
  readonly status: "requested";
}
export class PrivateAccessError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(
      code === "REAUTHENTICATION_REQUIRED"
        ? "Please sign in again before this sensitive request."
        : status === 401
          ? "Your session has expired or been revoked. Sign in again."
          : status === 404
            ? "This private report is not available."
            : status === 429
              ? "Too many requests. Please wait and try again."
              : "Private report access is temporarily unavailable.",
    );
  }
}
export function privateAccessMessage(cause: unknown, fallback: string): string {
  return cause instanceof PrivateAccessError ? cause.message : fallback;
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("PRIVATE_RESPONSE_INVALID");
  return value as Record<string, unknown>;
}
function string(value: unknown, max = 10000): string {
  if (typeof value !== "string" || value.length < 1 || value.length > max)
    throw new Error("PRIVATE_RESPONSE_INVALID");
  return value;
}
function exact(value: Record<string, unknown>, allowed: readonly string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    throw new Error("PRIVATE_RESPONSE_INVALID");
}
function pair(value: unknown) {
  const item = record(value);
  exact(item, ["label", "value"]);
  return { label: string(item.label, 200), value: string(item.value, 200) };
}
function block(value: unknown): CustomerBlock {
  const item = record(value);
  switch (item.type) {
    case "prose":
      exact(item, ["type", "paragraphs"]);
      if (!Array.isArray(item.paragraphs) || item.paragraphs.length < 1)
        throw new Error("PRIVATE_RESPONSE_INVALID");
      return { type: "prose", paragraphs: item.paragraphs.map((v) => string(v)) };
    case "number_card":
      exact(item, ["type", "caption", "value"]);
      return {
        type: "number_card",
        caption: string(item.caption, 500),
        value: string(item.value, 200),
      };
    case "comparison":
      exact(item, ["type", "body", "left", "right"]);
      return {
        type: "comparison",
        body: string(item.body),
        left: pair(item.left),
        right: pair(item.right),
      };
    case "lo_shu":
      exact(item, ["type", "caption", "grid"]);
      if (!Array.isArray(item.grid) || item.grid.length !== 9)
        throw new Error("PRIVATE_RESPONSE_INVALID");
      return {
        type: "lo_shu",
        caption: string(item.caption, 500),
        grid: item.grid.map((value) => {
          const cell = record(value);
          exact(cell, ["digit", "count"]);
          if (
            !Number.isInteger(cell.digit) ||
            Number(cell.digit) < 1 ||
            Number(cell.digit) > 9 ||
            !Number.isInteger(cell.count) ||
            Number(cell.count) < 0
          )
            throw new Error("PRIVATE_RESPONSE_INVALID");
          return { digit: Number(cell.digit), count: Number(cell.count) };
        }),
      };
    case "timeline":
      exact(item, ["type", "items"]);
      if (!Array.isArray(item.items) || item.items.length < 1)
        throw new Error("PRIVATE_RESPONSE_INVALID");
      return { type: "timeline", items: item.items.map(pair) };
    case "source_note":
      exact(item, ["type", "body"]);
      return { type: "source_note", body: string(item.body) };
    default:
      throw new Error("PRIVATE_RESPONSE_INVALID");
  }
}
function practice(value: unknown): CustomerPractice {
  const item = record(value);
  if (item.availability === "available") {
    exact(item, ["availability", "label", "instruction", "optional", "noPromisedResult"]);
    if (item.optional !== true || item.noPromisedResult !== true)
      throw new Error("PRIVATE_RESPONSE_INVALID");
    return {
      availability: "available",
      label: string(item.label, 500),
      instruction: string(item.instruction),
      optional: true,
      noPromisedResult: true,
    };
  }
  if (item.availability === "unavailable") {
    exact(item, ["availability", "label", "message", "optional", "noPromisedResult"]);
    if (item.optional !== true || item.noPromisedResult !== true)
      throw new Error("PRIVATE_RESPONSE_INVALID");
    return {
      availability: "unavailable",
      label: string(item.label, 500),
      message: string(item.message),
      optional: true,
      noPromisedResult: true,
    };
  }
  throw new Error("PRIVATE_RESPONSE_INVALID");
}
function lifecycleReceipt(value: unknown): LifecycleRequestReceipt {
  const item = record(value);
  exact(item, ["action", "id", "requestedAt", "status"]);
  if (
    !UUID.test(String(item.id)) ||
    !["correction", "export", "deletion"].includes(String(item.action)) ||
    item.status !== "requested" ||
    Number.isNaN(Date.parse(String(item.requestedAt)))
  )
    throw new Error("PRIVATE_RESPONSE_INVALID");
  return {
    action: item.action as LifecycleRequestReceipt["action"],
    id: String(item.id),
    requestedAt: String(item.requestedAt),
    status: "requested",
  };
}
export function parseCustomerReport(value: unknown): CustomerReport {
  const item = record(value);
  exact(item, [
    "disclaimer",
    "displayName",
    "locale",
    "practicalAlternatives",
    "sections",
    "title",
    "traditionalPractices",
  ]);
  if (
    !locales.has(String(item.locale)) ||
    !Array.isArray(item.sections) ||
    !Array.isArray(item.practicalAlternatives) ||
    !Array.isArray(item.traditionalPractices)
  )
    throw new Error("PRIVATE_RESPONSE_INVALID");
  return {
    disclaimer: string(item.disclaimer),
    displayName: string(item.displayName, 500),
    locale: item.locale as CustomerReport["locale"],
    title: string(item.title, 500),
    sections: item.sections.map((value) => {
      const section = record(value);
      exact(section, ["blocks", "dek", "order", "title"]);
      if (
        !Number.isInteger(section.order) ||
        !Array.isArray(section.blocks) ||
        section.blocks.length < 1
      )
        throw new Error("PRIVATE_RESPONSE_INVALID");
      return {
        order: Number(section.order),
        title: string(section.title, 500),
        ...(section.dek === undefined ? {} : { dek: string(section.dek) }),
        blocks: section.blocks.map(block),
      };
    }),
    traditionalPractices: item.traditionalPractices.map(practice),
    practicalAlternatives: item.practicalAlternatives.map(practice),
  };
}
export function createPrivateAccessClient(
  dependencies: { fetch: typeof fetch; csrf: () => string; key: () => string } = {
    fetch: (...args) => fetch(...args),
    csrf: readIntakeCsrf,
    key: () => crypto.randomUUID(),
  },
) {
  const keys = new Map<string, string>();
  async function request(path: string, method = "GET", body?: unknown, key?: string) {
    const csrf = dependencies.csrf();
    if (method !== "GET" && !/^[A-Za-z0-9_-]{43}$/u.test(csrf))
      throw new PrivateAccessError(401, "UNAUTHENTICATED");
    const response = await dependencies.fetch(`/api/v1${path}`, {
      method,
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(method === "GET" ? {} : { "X-CSRF-Token": csrf }),
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const value: unknown = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) {
      const candidate =
        value && typeof value === "object" && "code" in value && typeof value.code === "string"
          ? value.code
          : "PRIVATE_ACCESS_FAILED";
      throw new PrivateAccessError(response.status, candidate);
    }
    return value;
  }
  return {
    async account() {
      const value = record(await request("/account"));
      exact(value, ["reports"]);
      if (!Array.isArray(value.reports)) throw new Error("PRIVATE_RESPONSE_INVALID");
      return {
        reports: value.reports.map((entry) => {
          const item = record(entry);
          exact(item, ["id", "locale", "readyAt", "status", "title"]);
          if (
            !UUID.test(String(item.id)) ||
            !locales.has(String(item.locale)) ||
            item.status !== "ready" ||
            Number.isNaN(Date.parse(String(item.readyAt)))
          )
            throw new Error("PRIVATE_RESPONSE_INVALID");
          return {
            id: String(item.id),
            locale: item.locale as AccountReport["locale"],
            readyAt: String(item.readyAt),
            status: "ready" as const,
            title: string(item.title, 500),
          };
        }),
      };
    },
    async report(id: string) {
      if (!UUID.test(id)) throw new PrivateAccessError(404, "REPORT_NOT_FOUND");
      return parseCustomerReport(await request(`/reports/${id}`));
    },
    async request(id: string, action: "correction" | "export" | "deletion") {
      if (!UUID.test(id)) throw new PrivateAccessError(404, "REPORT_NOT_FOUND");
      const mapKey = `${id}:${action}`;
      const key = keys.get(mapKey) ?? dependencies.key();
      keys.set(mapKey, key);
      return lifecycleReceipt(await request(`/reports/${id}/requests`, "POST", { action }, key));
    },
    async revokeAll() {
      return request("/auth/revoke-all", "POST", {});
    },
  };
}
