import type { ReportSectionKey } from "@numerology/doctrine";

const SECTION_COPY: Readonly<Record<ReportSectionKey, readonly string[]>> = Object.freeze({
  actions: [
    "Choose a small prompt that can be paused, changed, or declined without consequence.",
    "An ordinary observation is more useful here than a dramatic interpretation or a promised result.",
    "Keep the decision with the reader and use the symbolic language only as a conversation starter.",
    "A neutral response is informative because a cultural practice does not need to fit every experience.",
  ],
  birthday_psychic_comparison: [
    "These positions come from named traditions, so their formulas remain visible rather than being blended.",
    "A shared theme can be interesting while the separate calculations retain different historical boundaries.",
    "Compare the language around each position instead of treating a school as a correction of another.",
    "The useful question is what each method invites the reader to notice in ordinary experience.",
  ],
  core_overview: [
    "The overview gathers the positions that the calculation bundle produced under its chosen methods.",
    "Each displayed value remains attached to a calculated position and can be followed back to a calculation step.",
    "Numbers here describe the selected method output and do not establish a measurement of personality.",
    "Read the map as an organised starting point for reflection, with room for agreement and disagreement.",
  ],
  cover_reading_guide: [
    "This guide explains how to approach a symbolic reading with curiosity, care, and a clear boundary around certainty.",
    "The report offers cultural interpretation rather than a measurement, forecast, or professional instruction.",
    "Notice which prompts feel useful, which feel neutral, and which do not describe the reader at all.",
    "The reader can pause, disagree, or choose no change after considering any passage in this report.",
  ],
  current_name_comparison: [
    "The current-name view uses the supplied name scope and keeps its alphabet separate from other traditions.",
    "A difference between name positions is a method boundary, not evidence that a single identity is more authentic.",
    "Use this comparison to ask how labels and social use may shape reflection without assigning a fixed outcome.",
    "The calculation records a named input policy so another reader can reproduce the same limited comparison.",
  ],
  growth_edges: [
    "A growth edge is presented as a question about practice, not as a defect that requires correction.",
    "Small experiments can test whether a theme is useful without turning symbolic language into an instruction.",
    "The reader may keep an observation, revise it, or set it aside as the context changes.",
    "Bounded reflection protects agency because no calculated position can decide what another person should do.",
  ],
  input_methods: [
    "The methods note identifies the date boundary, method set, name scope, and calculation choices.",
    "Keeping inputs and methods visible makes reproduction possible without exposing the private intake values.",
    "A method-based interpretation is limited to the material available for this reading.",
    "The appendix should be read as method notes, not as a claim that the tradition has scientific validation.",
  ],
  life_path: [
    "The Life Path passage stays with the named Western method and does not borrow a reduction from another school.",
    "Its theme is a prompt for noticing recurring choices, responsibilities, or questions in everyday settings.",
    "The same position can feel relevant, neutral, or unhelpful at different moments of a person’s life.",
    "A useful reading leaves room for context, evidence, and the reader’s own account of what happened.",
  ],
  lo_shu_augmented_comparison: [
    "The augmented grid is displayed beside the raw civil-date grid so the additional practitioner convention is visible.",
    "Different cell counts should not be added together because they answer different methodological questions.",
    "Look for how both layouts frame attention while remembering that neither layout predicts an event.",
    "The comparison protects tradition boundaries by naming the origin of each displayed structure.",
  ],
  lo_shu_raw_grid: [
    "The raw grid counts civil-date digits in a fixed geometry and preserves the count for review.",
    "Presence or absence in a cell is an observation within this method, not a judgement about a person.",
    "Repeated digits can provide a prompt for reflection while an empty cell can remain simply an empty cell.",
    "The grid is most useful when its construction choices stay separate from later interpretive language.",
  ],
  methodology_appendix: [
    "The appendix names the calculation choices that shaped the report.",
    "Its purpose is repeatability: a reader can understand what was calculated without receiving a hidden explanation.",
    "Different methods remain distinct, so disagreements can stay visible.",
    "Documented notes make a later correction a new report rather than a silent rewrite of this reading.",
  ],
  name_change_comparison: [
    "A name-change comparison treats birth and current use as separate inputs wherever the evidence supports both.",
    "Changing a label does not erase the earlier calculation and does not guarantee a different personal result.",
    "The comparison can prompt a conversation about context, audience, and self-description in ordinary life.",
    "Keep any conclusion provisional because names carry social meaning beyond a numerical convention.",
  ],
  personal_months: [
    "The month map offers a sequence of symbolic themes for the recorded calendar year without forecasting events.",
    "Each month remains time-bounded, and the reader can compare the prompt with ordinary observations afterward.",
    "A monthly theme is not a deadline, warning, or instruction to make a consequential choice.",
    "Recording a neutral or missed impression is as valuable as recording a moment that felt relevant.",
  ],
  personal_year: [
    "The personal-year passage frames a time-bounded theme and avoids treating a calendar cycle as a promise.",
    "Use the theme to consider priorities that are already visible in ordinary circumstances and relationships.",
    "A cycle can be interesting without being predictive, exclusive, or more authoritative than lived evidence.",
    "The reader remains free to make no change when the symbolic framing does not fit the present context.",
  ],
  relationships: [
    "Relationship reflection stays with communication and mutual understanding rather than judging another person.",
    "No position in this report can establish compatibility, consent, motive, or a verdict about a third party.",
    "A practical conversation and careful listening provide better evidence than a symbolic label alone.",
    "Use the passage to ask an open question, then respect the answer and the other person’s agency.",
  ],
  repeated_strengths: [
    "Repeated themes are independent echoes in the selected evidence and are not measures of certainty.",
    "Agreement across methods can suggest a question worth exploring while disagreement remains meaningful information.",
    "A strength is described as a possible resource, not as a permanent trait or a reason to ignore context.",
    "The reader can test the theme against ordinary examples and keep only what remains useful and proportionate.",
  ],
  western_name_layers: [
    "The Western name layers retain their documented alphabet, name scope, compound value, and reduction policy.",
    "Each layer answers a different question within the same tradition and should not be silently substituted.",
    "A name position can support a reflective prompt without defining the person who supplied the name.",
    "The documented steps make the method clear and keep interpretation narrower than the input itself.",
  ],
  work_money: [
    "Work and money themes are limited to reflective questions and never become financial or employment advice.",
    "A symbolic pattern cannot select a financial choice, determine eligibility, or decide whether a person should leave work.",
    "Ordinary evidence, qualified guidance, and the reader’s circumstances remain more relevant to consequential choices.",
    "Use this section to name a value or question, then choose a reversible action that does not create pressure.",
  ],
});

/*
 * The filler is still deterministic, but each sentence must earn its place in
 * the section.  A section lens is intentionally separate from the approved
 * base copy above so the resulting prose carries the domain context instead
 * of an interchangeable marker such as "opening" or "review".
 */
const SECTION_LENSES: Readonly<Record<ReportSectionKey, string>> = Object.freeze({
  actions:
    "This keeps the next step reversible and leaves room to pause when ordinary evidence points elsewhere.",
  birthday_psychic_comparison:
    "This holds the named traditions apart so a comparison stays descriptive rather than becoming a contest.",
  core_overview:
    "This uses the mapped positions as an organised index for reflection, not as a personality measurement.",
  cover_reading_guide:
    "This keeps every prompt optional and bounds certainty by the cultural status of the method.",
  current_name_comparison:
    "This keeps the supplied current-name scope visible so a difference remains a method boundary.",
  growth_edges:
    "This frames the theme as a question about practice and never as a defect requiring correction.",
  input_methods:
    "This makes the chosen inputs and approaches repeatable without exposing private intake values.",
  life_path:
    "This relates the named position to ordinary choices while keeping the reader's own account primary.",
  lo_shu_augmented_comparison:
    "This reads the added convention beside the raw grid so both constructions remain distinct.",
  lo_shu_raw_grid:
    "This treats each cell count as a dated observation rather than a judgement about the person.",
  methodology_appendix:
    "This keeps the method choices clear and the traditions distinct for the reader.",
  name_change_comparison:
    "This compares birth and current use as separate scopes without treating either label as a fixed identity.",
  personal_months:
    "This keeps each monthly prompt bounded to its period and gives neutral observations equal weight.",
  personal_year:
    "This uses the cycle as a time-bounded lens while leaving consequential choices to context and qualified advice.",
  relationships:
    "This keeps communication, consent, and the other person's agency ahead of any symbolic label.",
  repeated_strengths:
    "This treats repeated themes as possible resources and leaves disagreement available as useful information.",
  western_name_layers:
    "This keeps alphabet, scope, compound handling, and reduction policy visible within the named school.",
  work_money:
    "This limits the reflection to values and reversible questions rather than financial or employment advice.",
});

const EDITORIAL_STAGES = [
  "Start with an ordinary example before extending the theme.",
  "Compare the prompt with lived evidence instead of asking it to predict an outcome.",
  "Name what fits, what feels neutral, and what does not fit at all.",
  "Let the reader choose the language that is useful and set aside the rest.",
  "Return to the question after a pause so an initial impression does not become an instruction.",
  "Invite context from the present situation before drawing any broad conclusion.",
  "Record a small observation that can be revisited without creating pressure.",
  "Close by preserving uncertainty and the freedom to make no change.",
] as const;

/** Returns one pre-reviewed, section-specific editorial sentence. */
export function editorialSentence(sectionKey: ReportSectionKey, index: number): string {
  const copy = SECTION_COPY[sectionKey];
  const base = copy[index % copy.length] ?? copy[0] ?? "";
  const stage = EDITORIAL_STAGES[Math.floor(index / copy.length) % EDITORIAL_STAGES.length] ?? "";
  const lowerFirst = (value: string) => value.charAt(0).toLocaleLowerCase("en-US") + value.slice(1);
  return `${base.replace(/[.!?]$/u, "")}; ${lowerFirst(SECTION_LENSES[sectionKey]).replace(/[.!?]$/u, "")}, ${lowerFirst(stage)}`;
}

export function editorialTemplateId(sectionKey: ReportSectionKey, index: number): string {
  return `editorial.${sectionKey}.${index}`;
}
