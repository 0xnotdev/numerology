import type { EngineWarning, LetterClassification, NameInput } from "./types";

export interface NormalizedName {
  readonly calculationText: string | null;
  readonly id: string;
  readonly kind: NameInput["kind"];
  readonly locale?: string;
  readonly nfc: string;
  readonly script: string;
  readonly transliteration?: NameInput["transliteration"];
  readonly yClassifications: Readonly<Record<string, "vowel" | "consonant">>;
}

const BIDI_OR_CONTROL = /[\p{Cc}\p{Cf}\u202A-\u202E\u2066-\u2069]/u;
const MARKUP = /[<>]/u;
const NAME_DIGIT = /\p{Number}/u;
const EXTENDED_PICTOGRAPHIC = /\p{Extended_Pictographic}/u;
const NAME_SEPARATORS = new Set([" ", "\t", "\n", "\r"]);
const VOWELS = new Set(["A", "E", "I", "O", "U"]);
const NAME_KINDS = new Set<NameInput["kind"]>([
  "birth_full",
  "current_full",
  "popular",
  "report_display",
  "engine_latin",
  "birth_legal",
  "current_legal",
  "usual",
  "nickname",
  "professional",
  "stage",
  "married",
  "religious",
  "business",
]);

function inferScript(value: string): string {
  if (/^[\p{Script=Latin}\p{Mark}\s'’ʼ.-]+$/u.test(value)) {
    return "Latn";
  }
  if (/\p{Script=Devanagari}/u.test(value)) {
    return "Deva";
  }
  if (/\p{Script=Bengali}/u.test(value)) {
    return "Beng";
  }
  if (/\p{Script=Oriya}/u.test(value)) {
    return "Orya";
  }
  return "Zyyy";
}

export interface NameToken {
  readonly start: number;
  readonly text: string;
}

export interface ClassifiedLetter {
  readonly character: string;
  readonly classification: LetterClassification;
  readonly index: number;
}

export function tokenizeNameUnits(input: string): readonly NameToken[] {
  if (typeof input !== "string") {
    throw new RangeError("Name tokenization requires a string.");
  }
  const normalized = input.normalize("NFC");
  const tokens: NameToken[] = [];
  let current = "";
  let start = 0;
  for (const [index, character] of Array.from(normalized).entries()) {
    if (NAME_SEPARATORS.has(character)) {
      if (current.length > 0) {
        tokens.push(Object.freeze({ start, text: current }));
        current = "";
      }
      continue;
    }
    if (current.length === 0) {
      start = index;
    }
    current += character;
  }
  if (current.length > 0) {
    tokens.push(Object.freeze({ start, text: current }));
  }
  return Object.freeze(tokens);
}

export function classifyLetters(
  input: string,
  yClassifications: Readonly<Record<string, LetterClassification>> = {},
): readonly ClassifiedLetter[] {
  if (typeof input !== "string") {
    throw new RangeError("Letter classification requires a string.");
  }
  const normalized = input.normalize("NFC").toUpperCase();
  const classified: ClassifiedLetter[] = [];
  for (const [index, character] of Array.from(normalized).entries()) {
    if (NAME_SEPARATORS.has(character) || ["-", "'", "’", "ʼ", "."].includes(character)) {
      continue;
    }
    if (!/^[A-Z]$/u.test(character)) {
      throw new RangeError(`Unsupported letter at index ${index}.`);
    }
    let classification: LetterClassification;
    if (VOWELS.has(character)) {
      classification = "vowel";
    } else if (character === "Y") {
      const yClassification = yClassifications[String(index)];
      if (yClassification !== "vowel" && yClassification !== "consonant") {
        throw new RangeError(`Y classification required at index ${index}.`);
      }
      classification = yClassification;
    } else {
      classification = "consonant";
    }
    classified.push(Object.freeze({ character, classification, index }));
  }
  return Object.freeze(classified);
}

function normalizeEngineSpacing(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}

function assertSafeNameText(value: string): void {
  if (value.trim().length === 0) {
    throw new RangeError("Name value is required.");
  }
  if (Array.from(value).length > 120) {
    throw new RangeError("Name value exceeds the 120-character limit.");
  }
  if (BIDI_OR_CONTROL.test(value) || MARKUP.test(value) || EXTENDED_PICTOGRAPHIC.test(value)) {
    throw new RangeError("Name value contains unsupported control, markup, or emoji characters.");
  }
  if (NAME_DIGIT.test(value)) {
    throw new RangeError("Name metrics reject digits; store numbers outside the name view.");
  }
}

export function normalizeName(input: NameInput): NormalizedName {
  if (input === null || typeof input !== "object") {
    throw new RangeError("Name input must be an object.");
  }
  if (typeof input.id !== "string" || input.id.trim().length === 0) {
    throw new RangeError("Name id is required.");
  }
  if (typeof input.kind !== "string" || !NAME_KINDS.has(input.kind)) {
    throw new RangeError("Name kind is unsupported.");
  }
  if (typeof input.value !== "string") {
    throw new RangeError("Name value must be a string.");
  }
  if (input.calculationText !== undefined && typeof input.calculationText !== "string") {
    throw new RangeError("Name calculation text must be a string.");
  }
  if (input.locale !== undefined && typeof input.locale !== "string") {
    throw new RangeError("Name locale must be a string.");
  }
  if (input.script !== undefined && typeof input.script !== "string") {
    throw new RangeError("Name script must be a string.");
  }
  if (input.yClassifications !== undefined) {
    if (
      input.yClassifications === null ||
      typeof input.yClassifications !== "object" ||
      Array.isArray(input.yClassifications)
    ) {
      throw new RangeError("Y classifications must be an object.");
    }
    for (const [index, classification] of Object.entries(input.yClassifications)) {
      if (!/^\d+$/u.test(index) || (classification !== "vowel" && classification !== "consonant")) {
        throw new RangeError("Y classifications contain an invalid occurrence.");
      }
    }
  }
  if (input.transliteration !== undefined) {
    if (
      typeof input.transliteration !== "object" ||
      input.transliteration === null ||
      typeof input.transliteration.scheme !== "string" ||
      input.transliteration.scheme.trim().length === 0 ||
      typeof input.transliteration.version !== "string" ||
      input.transliteration.version.trim().length === 0 ||
      typeof input.transliteration.userConfirmed !== "boolean"
    ) {
      throw new RangeError("Name transliteration metadata is invalid.");
    }
  }

  const nfc = input.value.normalize("NFC");
  assertSafeNameText(nfc);
  const script = input.script ?? inferScript(nfc);
  const calculationSource =
    input.calculationText !== undefined
      ? normalizeEngineSpacing(input.calculationText.normalize("NFC"))
      : script === "Latn"
        ? normalizeEngineSpacing(nfc)
        : null;
  if (calculationSource !== null) {
    assertSafeNameText(calculationSource);
  }

  const base = {
    calculationText: calculationSource,
    id: input.id,
    kind: input.kind,
    nfc,
    script,
    yClassifications: Object.freeze({ ...(input.yClassifications ?? {}) }),
  };
  const transliteration =
    input.transliteration === undefined ? undefined : Object.freeze({ ...input.transliteration });

  const withOptionalFields = input.locale === undefined ? base : { ...base, locale: input.locale };
  if (transliteration !== undefined) {
    return Object.freeze({ ...withOptionalFields, transliteration });
  }
  return Object.freeze(withOptionalFields);
}

export function latinReadinessWarning(
  name: NormalizedName,
  warningId: string,
): EngineWarning | null {
  if (name.calculationText !== null && name.script === "Latn") {
    return null;
  }
  if (
    name.calculationText !== null &&
    name.script !== "Latn" &&
    name.transliteration?.userConfirmed === true
  ) {
    return null;
  }
  if (name.calculationText !== null && name.script !== "Latn") {
    return {
      code: "ENGINE_TRANSLITERATION_CONFIRMATION_REQUIRED",
      inputRef: `name:${name.id}`,
      message: "Name calculation uses only a customer-confirmed Latin engine spelling.",
      policyId: "identity.transliteration.confirmed-latin.v1",
      severity: "warning",
      warningId,
    };
  }
  return {
    code: "ENGINE_LATIN_NAME_REQUIRED",
    inputRef: `name:${name.id}`,
    message:
      "This profile requires a customer-confirmed Latin engine spelling; no name number was calculated.",
    policyId: "identity.engine-latin-required.v1",
    severity: "warning",
    warningId,
  };
}
