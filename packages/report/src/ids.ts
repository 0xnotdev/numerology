declare const reportIdBrand: unique symbol;
declare const reportClaimIdBrand: unique symbol;
declare const reportSectionIdBrand: unique symbol;

/** A UUID report identifier validated at the report boundary. */
export type ReportId = string & { readonly [reportIdBrand]: "ReportId" };
/** A deterministic planner/writer claim identifier validated at the report boundary. */
export type ReportClaimId = string & { readonly [reportClaimIdBrand]: "ReportClaimId" };
/** A deterministic structured-report section identifier validated at the report boundary. */
export type ReportSectionId = string & { readonly [reportSectionIdBrand]: "ReportSectionId" };

const REPORT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const CLAIM_ID_PATTERN = /^claim\.(?:contradiction\.)?[a-z0-9][a-z0-9._-]*$/u;
const SECTION_ID_PATTERN = /^section\.[a-z][a-z0-9_]*$/u;

function parseIdentifier<T extends string>(value: unknown, pattern: RegExp, code: string): T {
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new RangeError(`${code}: ${String(value)}`);
  }
  return value as T;
}

export function parseReportId(value: unknown): ReportId {
  return parseIdentifier<ReportId>(value, REPORT_ID_PATTERN, "INVALID_REPORT_ID");
}

export function parseReportClaimId(value: unknown): ReportClaimId {
  return parseIdentifier<ReportClaimId>(value, CLAIM_ID_PATTERN, "INVALID_REPORT_CLAIM_ID");
}

export function parseReportSectionId(value: unknown): ReportSectionId {
  return parseIdentifier<ReportSectionId>(value, SECTION_ID_PATTERN, "INVALID_REPORT_SECTION_ID");
}

export function isReportId(value: unknown): value is ReportId {
  return typeof value === "string" && REPORT_ID_PATTERN.test(value);
}

export function isReportClaimId(value: unknown): value is ReportClaimId {
  return typeof value === "string" && CLAIM_ID_PATTERN.test(value);
}

export function isReportSectionId(value: unknown): value is ReportSectionId {
  return typeof value === "string" && SECTION_ID_PATTERN.test(value);
}
