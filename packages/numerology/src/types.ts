import type { FactId } from "./ids";

export const ENGINE_VERSION = "calc-1.0.0";

export const PROFILE_IDS = Object.freeze([
  "western_decoz_v1",
  "western_digit_sum_v1",
  "western_balliett_1908_v1",
  "cheiro_1926_v1",
  "indian_johari_1990_v1",
  "loshu_raw_dob_v1",
  "loshu_indian_augmented_v1",
] as const);

export type ProfileId = (typeof PROFILE_IDS)[number];

export type NameKind =
  | "birth_full"
  | "current_full"
  | "popular"
  | "report_display"
  | "engine_latin"
  | "birth_legal"
  | "current_legal"
  | "usual"
  | "nickname"
  | "professional"
  | "stage"
  | "married"
  | "religious"
  | "business";

export type LetterClassification = "vowel" | "consonant";

export interface NameInput {
  readonly calculationText?: string;
  readonly id: string;
  readonly kind: NameKind;
  readonly locale?: string;
  readonly script?: string;
  readonly transliteration?: {
    readonly scheme: string;
    readonly userConfirmed: true;
    readonly version: string;
  };
  readonly value: string;
  readonly yClassifications?: Readonly<Record<string, LetterClassification>>;
}

export interface CalculationRequest {
  readonly asOfDate: string;
  readonly civilDate: string;
  readonly names: readonly NameInput[];
  readonly profiles: readonly ProfileId[];
  readonly schemaVersion: "1.0.0";
}

export type TraceOperation = "count_digits" | "difference" | "map_letters" | "reduce" | "sum";

export interface NumericTrace {
  readonly inputs: readonly (number | string)[];
  readonly intermediates: readonly number[];
  readonly operation: TraceOperation;
  readonly output: number;
  readonly policyId: string;
  readonly traceId: string;
}

export type FactMetadata = Readonly<Record<string, unknown>>;

export interface CalculatedFact {
  readonly compound?: number;
  readonly displayTokens: readonly string[];
  readonly factId: FactId;
  readonly karmicDebts?: readonly number[];
  readonly master?: 11 | 22 | 33;
  readonly metadata?: FactMetadata;
  readonly metricId: string;
  readonly occurrences?: Readonly<Record<string, number>>;
  readonly profileId: ProfileId;
  readonly root: number;
  readonly traceIds: readonly string[];
}

export interface EngineWarning {
  readonly code:
    | "ENGINE_LATIN_NAME_REQUIRED"
    | "ENGINE_TRANSLITERATION_CONFIRMATION_REQUIRED"
    | "JOHARI_PREDAWN_BOUNDARY_EXCLUDED"
    | "NAME_METRIC_NOT_APPLICABLE"
    | "MISSING_NAME_USE"
    | "UNSUPPORTED_NAME_CHARACTER"
    | "WESTERN_Y_CLASSIFICATION_REQUIRED";
  readonly inputRef?: string;
  readonly message: string;
  readonly metadata?: Readonly<Record<string, number | string>>;
  readonly policyId: string;
  readonly profileId?: ProfileId;
  readonly severity: "info" | "warning";
  readonly warningId: string;
}

export interface CalculationBundle {
  readonly engineVersion: string;
  readonly facts: readonly CalculatedFact[];
  readonly formulaManifestHash: string;
  readonly inputHash: string;
  readonly traces: readonly NumericTrace[];
  readonly warnings: readonly EngineWarning[];
}

export interface BundleValidationResult {
  readonly diagnostics: readonly string[];
  readonly valid: boolean;
}

export type Digit = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type MasterNumber = 11 | 22 | 33;
