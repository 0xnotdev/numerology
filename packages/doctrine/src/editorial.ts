import type { ProfileId } from "@numerology/engine";
import { deepFreeze } from "@numerology/shared";

/** Canonical report sections owned by doctrine's editorial boundary. */
export const REPORT_SECTION_KEYS = [
  "cover_reading_guide",
  "input_methods",
  "core_overview",
  "life_path",
  "birthday_psychic_comparison",
  "western_name_layers",
  "current_name_comparison",
  "name_change_comparison",
  "lo_shu_raw_grid",
  "lo_shu_augmented_comparison",
  "repeated_strengths",
  "growth_edges",
  "work_money",
  "relationships",
  "personal_year",
  "personal_months",
  "actions",
  "methodology_appendix",
] as const;

export type ReportSectionKey = (typeof REPORT_SECTION_KEYS)[number];

export interface EditorialSection {
  readonly key: ReportSectionKey;
  readonly label: string;
  readonly order: number;
  readonly wordBudget: number;
}

const SECTION_LABELS: Readonly<Record<ReportSectionKey, string>> = {
  actions: "Actions",
  birthday_psychic_comparison: "Birthday and psychic comparison",
  core_overview: "Core overview",
  cover_reading_guide: "Cover and reading guide",
  current_name_comparison: "Current name comparison",
  growth_edges: "Growth edges",
  input_methods: "Inputs and methods",
  life_path: "Life path",
  lo_shu_augmented_comparison: "Lo Shu augmented comparison",
  lo_shu_raw_grid: "Lo Shu raw grid",
  methodology_appendix: "Methodology appendix",
  name_change_comparison: "Name change comparison",
  personal_months: "Personal months",
  personal_year: "Personal year",
  relationships: "Relationships",
  repeated_strengths: "Repeated strengths",
  western_name_layers: "Western name layers",
  work_money: "Work and money",
};

const SECTION_WORD_BUDGETS: Readonly<Record<ReportSectionKey, number>> = {
  actions: 160,
  birthday_psychic_comparison: 160,
  core_overview: 180,
  cover_reading_guide: 80,
  current_name_comparison: 240,
  growth_edges: 480,
  input_methods: 120,
  life_path: 180,
  lo_shu_augmented_comparison: 120,
  lo_shu_raw_grid: 160,
  methodology_appendix: 200,
  name_change_comparison: 160,
  personal_months: 160,
  personal_year: 120,
  relationships: 140,
  repeated_strengths: 200,
  western_name_layers: 180,
  work_money: 140,
};

export const EDITORIAL_SECTIONS: readonly EditorialSection[] = deepFreeze(
  REPORT_SECTION_KEYS.map((key, index) => ({
    key,
    label: SECTION_LABELS[key],
    order: index + 1,
    wordBudget: SECTION_WORD_BUDGETS[key],
  })),
);

export interface DoctrineProfileMethod {
  /** A family is the independence unit; formula variants in one tradition share it. */
  readonly familyId: string;
  readonly methodLabel: string;
  readonly profileId: ProfileId;
}

export const DOCTRINE_PROFILE_METHODS: readonly DoctrineProfileMethod[] = deepFreeze([
  {
    familyId: "modern-western",
    methodLabel: "Modern Western (De-Coz reduction)",
    profileId: "western_decoz_v1",
  },
  {
    familyId: "modern-western",
    methodLabel: "Modern Western (digit-sum reduction)",
    profileId: "western_digit_sum_v1",
  },
  {
    familyId: "historical-western",
    methodLabel: "Balliett 1908 Western",
    profileId: "western_balliett_1908_v1",
  },
  { familyId: "cheiro", methodLabel: "Cheiro 1926", profileId: "cheiro_1926_v1" },
  {
    familyId: "johari",
    methodLabel: "Johari 1990 Indian",
    profileId: "indian_johari_1990_v1",
  },
  { familyId: "lo-shu", methodLabel: "Lo Shu raw date grid", profileId: "loshu_raw_dob_v1" },
  {
    familyId: "lo-shu",
    methodLabel: "Lo Shu Indian augmented grid",
    profileId: "loshu_indian_augmented_v1",
  },
]);

const PROFILE_METHOD_BY_ID = new Map(
  DOCTRINE_PROFILE_METHODS.map((profile) => [profile.profileId, profile]),
);

export function doctrineProfileMethod(profileId: ProfileId): DoctrineProfileMethod {
  const method = PROFILE_METHOD_BY_ID.get(profileId);
  /* c8 ignore next 3 -- ProfileId and the exhaustive catalog are compile-time synchronized. */
  if (method === undefined) {
    throw new RangeError(`UNKNOWN_DOCTRINE_PROFILE: ${profileId}`);
  }
  return method;
}
