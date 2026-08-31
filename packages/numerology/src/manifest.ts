import { canonicalHash } from "./stable-json";
import type { MasterNumber } from "./types";

export interface MetricManifest {
  readonly formula: string;
  readonly masters: readonly MasterNumber[];
  readonly source: string;
}

export interface ProfileManifest {
  readonly alphabet?: string;
  readonly augmentation?: readonly string[];
  readonly compoundPolicy?: string;
  readonly dateBoundary?: string;
  readonly forbids?: readonly string[];
  readonly grid?: readonly (readonly number[])[];
  readonly inherits?: string;
  readonly metrics: Readonly<Record<string, MetricManifest>>;
  readonly nameScope?: string;
  readonly profileId: string;
  readonly status?: string;
  readonly tradition: string;
}

export interface FormulaManifestInput {
  readonly mappings: Readonly<Record<string, Readonly<Record<number, string>>>>;
  readonly profiles: Readonly<Record<string, ProfileManifest>>;
}

export interface FormulaManifestCompiled extends FormulaManifestInput {
  readonly hash: string;
}

const EXPECTED_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const ALLOWED_MASTERS = new Set<MasterNumber>([11, 22, 33]);

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function deepClone<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => deepClone(item)) as T;
  }
  return Object.fromEntries(
    Object.entries(value as UnknownRecord).map(([key, child]) => [key, deepClone(child)]),
  ) as T;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return value;
}

function validateMapping(mappingId: string, groups: Readonly<Record<number, string>>): void {
  if (!isRecord(groups)) {
    throw new RangeError(`Mapping ${mappingId} must be an object.`);
  }
  const seen = new Map<string, number>();
  for (const [valueText, letters] of Object.entries(groups)) {
    const value = Number(valueText);
    if (!Number.isInteger(value) || value < 1 || value > 9) {
      throw new RangeError(`Mapping ${mappingId} uses invalid value ${valueText}.`);
    }
    if (typeof letters !== "string") {
      throw new RangeError(`Mapping ${mappingId} values must be strings.`);
    }
    for (const letter of letters.toUpperCase()) {
      if (!/^[A-Z]$/u.test(letter)) {
        throw new RangeError(`Mapping ${mappingId} contains non-A-Z letter ${letter}.`);
      }
      const existing = seen.get(letter);
      if (existing !== undefined) {
        throw new RangeError(
          `Mapping ${mappingId} has overlap for ${letter}: ${existing} and ${value}.`,
        );
      }
      seen.set(letter, value);
    }
  }

  const missing = Array.from(EXPECTED_LETTERS).filter((letter) => !seen.has(letter));
  if (missing.length > 0) {
    throw new RangeError(`Mapping ${mappingId} is missing letters: ${missing.join("")}.`);
  }
}

function validateProfile(
  profileId: string,
  profile: ProfileManifest,
  mappings: Readonly<Record<string, Readonly<Record<number, string>>>>,
): void {
  if (!isRecord(profile)) {
    throw new RangeError(`Profile ${profileId} must be an object.`);
  }
  if (profile.profileId !== profileId || typeof profile.profileId !== "string") {
    throw new RangeError(`Profile ${profileId} has a mismatched profileId.`);
  }
  if (typeof profile.tradition !== "string" || profile.tradition.trim().length === 0) {
    throw new RangeError(`Profile ${profileId} requires a tradition.`);
  }
  if (!isRecord(profile.metrics) || Object.keys(profile.metrics).length === 0) {
    throw new RangeError(`Profile ${profileId} requires at least one metric.`);
  }
  if (profile.alphabet !== undefined) {
    if (typeof profile.alphabet !== "string" || mappings[profile.alphabet] === undefined) {
      throw new RangeError(`Profile ${profileId} references an unknown mapping.`);
    }
  }
  for (const [field, value] of [
    ["compoundPolicy", profile.compoundPolicy],
    ["dateBoundary", profile.dateBoundary],
    ["nameScope", profile.nameScope],
    ["status", profile.status],
  ] as const) {
    if (value !== undefined && (typeof value !== "string" || value.trim().length === 0)) {
      throw new RangeError(`Profile ${profileId} has an invalid ${field}.`);
    }
  }
  for (const [field, value] of [
    ["augmentation", profile.augmentation],
    ["forbids", profile.forbids],
  ] as const) {
    if (
      value !== undefined &&
      (!Array.isArray(value) ||
        value.some((entry) => typeof entry !== "string" || entry.length === 0))
    ) {
      throw new RangeError(`Profile ${profileId} has an invalid ${field} list.`);
    }
  }
  if (
    profile.grid !== undefined &&
    (!Array.isArray(profile.grid) ||
      profile.grid.length !== 3 ||
      profile.grid.some(
        (row) =>
          !Array.isArray(row) ||
          row.length !== 3 ||
          row.some((digit) => !Number.isInteger(digit) || digit < 1 || digit > 9),
      ))
  ) {
    throw new RangeError(`Profile ${profileId} has invalid grid geometry.`);
  }
  if (profile.grid !== undefined) {
    const gridDigits = profile.grid.flat();
    if (new Set(gridDigits).size !== 9) {
      throw new RangeError(`Profile ${profileId} grid must contain digits 1 through 9 once.`);
    }
  }

  for (const [metricId, metric] of Object.entries(profile.metrics)) {
    if (!isRecord(metric)) {
      throw new RangeError(`Profile ${profileId}.${metricId} must be an object.`);
    }
    if (typeof metric.formula !== "string" || metric.formula.trim().length === 0) {
      throw new RangeError(`Profile ${profileId}.${metricId} requires a formula.`);
    }
    if (typeof metric.source !== "string" || metric.source.trim().length === 0) {
      throw new RangeError(`Profile ${profileId}.${metricId} requires a source.`);
    }
    if (!Array.isArray(metric.masters)) {
      throw new RangeError(`Profile ${profileId}.${metricId} requires a master-number list.`);
    }
    const masters = new Set<number>();
    for (const master of metric.masters) {
      if (!ALLOWED_MASTERS.has(master as MasterNumber)) {
        throw new RangeError(`Profile ${profileId}.${metricId} uses an invalid master number.`);
      }
      if (masters.has(master)) {
        throw new RangeError(`Profile ${profileId}.${metricId} repeats a master number.`);
      }
      masters.add(master);
    }
  }
}

export function compileFormulaManifest(input: FormulaManifestInput): FormulaManifestCompiled {
  if (!isRecord(input) || !isRecord(input.mappings) || !isRecord(input.profiles)) {
    throw new RangeError("Formula manifest requires mappings and profiles objects.");
  }
  if (Object.keys(input.mappings).length === 0) {
    throw new RangeError("Formula manifest requires at least one mapping.");
  }
  for (const [mappingId, groups] of Object.entries(input.mappings)) {
    validateMapping(mappingId, groups as Readonly<Record<number, string>>);
  }
  if (Object.keys(input.profiles).length === 0) {
    throw new RangeError("Formula manifest requires at least one profile.");
  }
  for (const [profileId, profile] of Object.entries(input.profiles)) {
    validateProfile(
      profileId,
      profile as ProfileManifest,
      input.mappings as Readonly<Record<string, Readonly<Record<number, string>>>>,
    );
    if (
      isRecord(profile) &&
      profile.inherits !== undefined &&
      (typeof profile.inherits !== "string" || input.profiles[profile.inherits] === undefined)
    ) {
      throw new RangeError(`Profile ${profileId} references an unknown inherited profile.`);
    }
  }

  const compiled = {
    mappings: deepClone(input.mappings),
    profiles: deepClone(input.profiles),
  };
  return deepFreeze({ ...compiled, hash: canonicalHash(compiled) });
}

const PROFILE_MANIFEST_INPUT = {
  mappings: {
    cheiro_1926_latin_v1: {
      1: "AIJQY",
      2: "BKR",
      3: "CGLS",
      4: "DMT",
      5: "EHNX",
      6: "UVW",
      7: "OZ",
      8: "FP",
      9: "",
    },
    johari_unit_system_v1: {
      1: "AIJQY",
      2: "BCKR",
      3: "GLS",
      4: "DMT",
      5: "NE",
      6: "UVWX",
      7: "OZ",
      8: "FHP",
      9: "",
    },
    western_sequential_1_9_v1: {
      1: "AJS",
      2: "BKT",
      3: "CLU",
      4: "DMV",
      5: "ENW",
      6: "FOX",
      7: "GPY",
      8: "HQZ",
      9: "IR",
    },
  },
  profiles: {
    cheiro_1926_v1: {
      alphabet: "cheiro_1926_latin_v1",
      compoundPolicy: "retain_final_and_referrals",
      dateBoundary: "civil_midnight",
      forbids: ["combined_full_date_life_path"],
      metrics: {
        birth_number: { formula: "birth_day_only", masters: [], source: "Cheiro 1926" },
        month_number: { formula: "birth_month_only", masters: [], source: "Cheiro 1926" },
        name_number: { formula: "token_reduce_then_sum", masters: [], source: "Cheiro 1926" },
        year_number: { formula: "year_digit_sum", masters: [], source: "Cheiro 1926" },
      },
      nameScope: "socially_dominant_name",
      profileId: "cheiro_1926_v1",
      status: "launch",
      tradition: "Cheiro",
    },
    indian_johari_1990_v1: {
      alphabet: "johari_unit_system_v1",
      compoundPolicy: "retain_order_and_final",
      dateBoundary: "civil_midnight",
      metrics: {
        destiny_number: { formula: "dob_all_digits", masters: [], source: "Johari 1990" },
        name_number: { formula: "unit_system_letter_sum", masters: [], source: "Johari 1990" },
        projected_year: {
          formula: "month_day_last_two_year_digits_weekday",
          masters: [],
          source: "Johari 1990",
        },
        psychic_number: { formula: "birth_day_only", masters: [], source: "Johari 1990" },
      },
      nameScope: "popular_contextual_name",
      status: "launch",
      profileId: "indian_johari_1990_v1",
      tradition: "Indian/Johari",
    },
    loshu_indian_augmented_v1: {
      augmentation: ["psychic_root", "destiny_root"],
      grid: [
        [4, 9, 2],
        [3, 5, 7],
        [8, 1, 6],
      ],
      inherits: "loshu_raw_dob_v1",
      metrics: {
        grid: {
          formula: "raw_dob_plus_psychic_destiny",
          masters: [],
          source: "Lo Shu Indian augmentation",
        },
      },
      profileId: "loshu_indian_augmented_v1",
      status: "launch_comparison",
      tradition: "Lo Shu",
    },
    loshu_raw_dob_v1: {
      augmentation: ["none"],
      grid: [
        [4, 9, 2],
        [3, 5, 7],
        [8, 1, 6],
      ],
      metrics: {
        grid: { formula: "raw_dob_digits_zero_ignored", masters: [], source: "Lo Shu raw DOB" },
      },
      profileId: "loshu_raw_dob_v1",
      status: "launch",
      tradition: "Lo Shu",
    },
    western_balliett_1908_v1: {
      alphabet: "western_sequential_1_9_v1",
      compoundPolicy: "historical_balliett_no_modern_masters",
      dateBoundary: "civil_midnight",
      metrics: {
        birth_date: {
          formula: "component_reduce_then_sum_no_masters",
          masters: [],
          source: "Balliett 1908",
        },
        name: { formula: "token_reduce_then_sum_no_masters", masters: [], source: "Balliett 1908" },
      },
      nameScope: "full_birth_name",
      profileId: "western_balliett_1908_v1",
      status: "launch",
      tradition: "Western source evidence",
    },
    western_decoz_v1: {
      alphabet: "western_sequential_1_9_v1",
      compoundPolicy: "preserve_all_intermediates",
      dateBoundary: "civil_midnight",
      metrics: {
        attitude: { formula: "month_plus_day", masters: [11, 22, 33], source: "Decoz profile" },
        birthday: { formula: "day_number", masters: [11, 22, 33], source: "Decoz profile" },
        expression: {
          formula: "token_reduce_then_sum",
          masters: [11, 22, 33],
          source: "Decoz profile",
        },
        hidden_passion: {
          formula: "max_letter_value_frequency",
          masters: [],
          source: "Decoz profile",
        },
        karmic_lessons: { formula: "missing_letter_values", masters: [], source: "Decoz profile" },
        life_path: {
          formula: "component_reduce_then_sum",
          masters: [11, 22, 33],
          source: "Decoz profile",
        },
        maturity: {
          formula: "life_path_plus_expression",
          masters: [11, 22, 33],
          source: "Decoz profile",
        },
        personal_month: {
          formula: "personal_year_plus_month",
          masters: [],
          source: "Decoz profile",
        },
        personal_year: {
          formula: "sun_number_plus_calendar_year_digits",
          masters: [],
          source: "Decoz profile",
        },
        personality: {
          formula: "consonants_only_token_reduce_then_sum",
          masters: [11, 22, 33],
          source: "Decoz profile",
        },
        soul_urge: {
          formula: "vowels_only_token_reduce_then_sum",
          masters: [11, 22, 33],
          source: "Decoz profile",
        },
      },
      nameScope: "full_birth_name",
      profileId: "western_decoz_v1",
      status: "launch",
      tradition: "Western/Decoz",
    },
    western_digit_sum_v1: {
      inherits: "western_decoz_v1",
      metrics: {
        life_path: {
          formula: "continuous_digit_sum",
          masters: [11, 22, 33],
          source: "Formula comparison",
        },
      },
      profileId: "western_digit_sum_v1",
      status: "comparison",
      tradition: "Western comparison",
    },
  },
} as const;

export const FORMULA_MANIFEST = compileFormulaManifest(PROFILE_MANIFEST_INPUT);
export const FORMULA_MANIFEST_HASH = FORMULA_MANIFEST.hash;
export const PROFILE_MANIFESTS =
  FORMULA_MANIFEST.profiles as typeof PROFILE_MANIFEST_INPUT.profiles;
