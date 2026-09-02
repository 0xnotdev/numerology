import type { ReportSectionKey } from "@numerology/doctrine";
import type { SupportedReportLocale } from "./structured-report";

export const DETERMINISTIC_WRITER_VERSION = "deterministic-template.en-IN.1.0.0";
export const DETERMINISTIC_LOCALE_PACK_VERSION = "1.0.0";

export interface DeterministicLocalePack {
  readonly actionsIntroduction: string;
  readonly disclaimer: string;
  readonly locale: SupportedReportLocale;
  readonly methodologyNote: string;
  readonly methodsNote: string;
  readonly reportTitle: string;
  readonly sectionDeks: Readonly<Record<ReportSectionKey, string>>;
}

const SECTION_DEKS: Readonly<Record<ReportSectionKey, string>> = Object.freeze({
  actions: "Reversible reflection prompts grounded in the selected evidence.",
  birthday_psychic_comparison: "Named traditions are compared without blending their formulas.",
  core_overview: "A concise map of the calculated positions used in this report.",
  cover_reading_guide:
    "Use these traditional themes as prompts, not as predictions or instructions.",
  current_name_comparison: "Current-name methods retain their own alphabets and boundaries.",
  growth_edges: "Context-dependent tensions are paired with bounded agency.",
  input_methods: "The immutable calculation and doctrine versions used for this reading.",
  life_path: "A reflective reading of the named Western Life Path position.",
  lo_shu_augmented_comparison:
    "The practitioner augmentation stays visibly separate from the raw grid.",
  lo_shu_raw_grid: "Civil-date digits are counted in the fixed Lo Shu geometry.",
  methodology_appendix:
    "Facts, rules, sources, traces, limitations, and versions remain auditable.",
  name_change_comparison: "Name uses are compared only where the supplied evidence supports it.",
  personal_months: "A calendar-year reflection map, never an event forecast.",
  personal_year: "A time-bounded symbolic theme expressed with possibility language.",
  relationships: "Communication prompts without compatibility verdicts or third-party claims.",
  repeated_strengths: "Independent echoes raise salience, not certainty.",
  western_name_layers: "Birth-name positions remain distinct and traceable.",
  work_money: "Reflective themes only; no financial or employment advice.",
});

export const EN_IN_DETERMINISTIC_LOCALE_PACK: DeterministicLocalePack = Object.freeze({
  actionsIntroduction:
    "Choose only prompts that are safe, practical, low-cost, and easy to reverse.",
  disclaimer:
    "Numerology is a cultural tradition for structured self-reflection. It is not scientifically validated prediction, diagnosis, probability, or professional advice.",
  locale: "en-IN",
  methodologyNote:
    "The appendix preserves calculated fact identifiers, doctrine sources, school boundaries, and reproducibility versions.",
  methodsNote:
    "Every interpretation below is limited to the immutable calculated facts and approved doctrine evidence for this synthetic report.",
  reportTitle: "A reflective numerology report",
  sectionDeks: SECTION_DEKS,
});

export function deterministicLocalePack(locale: SupportedReportLocale): DeterministicLocalePack {
  if (locale !== "en-IN") {
    throw new RangeError(`DETERMINISTIC_LOCALE_UNAVAILABLE: ${locale}`);
  }
  return EN_IN_DETERMINISTIC_LOCALE_PACK;
}
