import { canonicalHash, validateBundle } from "@numerology/engine";
import type { CalculatedFact } from "@numerology/engine";
import {
  REPORT_PLAN_SCHEMA_VERSION,
  REPORT_PLANNER_VERSION,
  SECTION_KEYS,
  type ActionDefinition,
  type FactLink,
  type PlanStatistics,
  type PlanValidationResult,
  type PlannedAction,
  type PlannedClaim,
  type PlannedSection,
  type PlannerPolicy,
  type ProfileDescriptor,
  type ReportPlan,
  type ReportPlanningInput,
  type ReportSectionKey,
  ReportPlanningError,
  type ResolvedDoctrineRule,
  type SourceLink,
  type ThemeDefinition,
  type ThemeOrigin,
} from "./types";

const DEFAULT_POLICY = {
  maxActions: 5,
  maxClaimsPerTheme: 3,
  maxRootWordShare: 0.25,
  maxTimingWordShare: 0.2,
  minimumIndependentProfileFamilies: 3,
} as const;

const SECTION_WORD_BUDGETS: Readonly<Record<ReportSectionKey, number>> = {
  cover_reading_guide: 80,
  input_methods: 120,
  core_overview: 180,
  life_path: 180,
  birthday_psychic_comparison: 160,
  western_name_layers: 180,
  current_name_comparison: 240,
  name_change_comparison: 160,
  lo_shu_raw_grid: 160,
  lo_shu_augmented_comparison: 120,
  repeated_strengths: 200,
  growth_edges: 480,
  work_money: 140,
  relationships: 140,
  personal_year: 120,
  personal_months: 160,
  actions: 160,
  methodology_appendix: 200,
};

const MANDATORY_RESERVATIONS = [
  "core_overview",
  "school_disagreement",
  "actions",
  "safety_note",
  "methodology_appendix",
] as const;

const CORE_METRICS = new Set([
  "life_path",
  "birthday",
  "psychic_number",
  "destiny_number",
  "expression",
  "name_number",
]);

const UNSAFE_TAGS = new Set([
  "coercion",
  "credit",
  "death",
  "disease",
  "eligibility",
  "employment",
  "finance",
  "financial",
  "gambling",
  "health",
  "housing",
  "insurance",
  "investment",
  "legal",
  "medical",
  "mental_health",
  "physical_safety",
  "pregnancy",
  "self_harm",
  "suicide",
  "treatment",
]);

interface EffectivePolicy {
  readonly maxActions: number;
  readonly maxClaimsPerTheme: number;
  readonly maxRootWordShare: number;
  readonly maxTimingWordShare: number;
  readonly minimumIndependentProfileFamilies: number;
}

type SafeAction = ActionDefinition & {
  readonly cost: "free" | "low_cost";
  readonly reversibility: "reversible";
  readonly safety: "low_risk";
};

interface Candidate {
  readonly actionKeys: readonly string[];
  readonly allowedDisplayNumbers: readonly string[];
  readonly claimClass: PlannedClaim["claimClass"];
  readonly claimId: string;
  readonly contradictionIds: readonly string[];
  readonly contradictionResolutions: readonly string[];
  readonly factIds: readonly string[];
  readonly factLinks: readonly FactLink[];
  readonly independentProfileFamilyIds: readonly string[];
  readonly isTiming: boolean;
  readonly origin: ThemeOrigin;
  readonly primaryRoot: number | null;
  readonly profileIds: readonly string[];
  readonly relationship: PlannedClaim["relationship"];
  readonly ruleIds: readonly string[];
  readonly score: number;
  readonly sectionKey: ReportSectionKey;
  readonly sourceLinks: readonly SourceLink[];
  readonly themeId: string;
  readonly valence: PlannedClaim["valence"];
  readonly wordBudget: number;
}

function sortStrings(values: readonly string[]): string[] {
  return [...values].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

function uniqueSorted(values: readonly string[]): string[] {
  return sortStrings([...new Set(values)]);
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

function isSha256Hash(value: string): boolean {
  return /^sha256:[0-9a-f]{64}$/u.test(value);
}

function policyFor(policy: PlannerPolicy | undefined): EffectivePolicy {
  const result: EffectivePolicy = {
    maxActions: policy?.maxActions ?? DEFAULT_POLICY.maxActions,
    maxClaimsPerTheme: policy?.maxClaimsPerTheme ?? DEFAULT_POLICY.maxClaimsPerTheme,
    maxRootWordShare: policy?.maxRootWordShare ?? DEFAULT_POLICY.maxRootWordShare,
    maxTimingWordShare: policy?.maxTimingWordShare ?? DEFAULT_POLICY.maxTimingWordShare,
    minimumIndependentProfileFamilies:
      policy?.minimumIndependentProfileFamilies ?? DEFAULT_POLICY.minimumIndependentProfileFamilies,
  };
  if (
    !Number.isInteger(result.maxActions) ||
    !Number.isInteger(result.maxClaimsPerTheme) ||
    !Number.isInteger(result.minimumIndependentProfileFamilies) ||
    result.maxActions < 1 ||
    result.maxClaimsPerTheme < 1 ||
    result.minimumIndependentProfileFamilies < 1 ||
    result.maxRootWordShare <= 0 ||
    result.maxRootWordShare > 1 ||
    result.maxTimingWordShare <= 0 ||
    result.maxTimingWordShare > 1
  ) {
    throw new ReportPlanningError("PLANNER_POLICY_INVALID");
  }
  return result;
}

function sourceMap(sources: readonly SourceLink[]): ReadonlyMap<string, SourceLink> {
  const result = new Map<string, SourceLink>();
  for (const source of sources) {
    if (
      source === null ||
      typeof source !== "object" ||
      typeof source.sourceId !== "string" ||
      source.sourceId.length === 0 ||
      typeof source.locator !== "string" ||
      source.locator.length === 0 ||
      result.has(source.sourceId)
    ) {
      throw new ReportPlanningError("EVIDENCE_SOURCE_INVALID");
    }
    result.set(source.sourceId, source);
  }
  return result;
}

function profileMap(
  profiles: readonly ProfileDescriptor[],
): ReadonlyMap<string, ProfileDescriptor> {
  const result = new Map<string, ProfileDescriptor>();
  for (const profile of profiles) {
    if (
      profile === null ||
      typeof profile !== "object" ||
      typeof profile.profileId !== "string" ||
      profile.profileId.length === 0 ||
      typeof profile.familyId !== "string" ||
      profile.familyId.length === 0 ||
      typeof profile.methodLabel !== "string" ||
      profile.methodLabel.length === 0 ||
      result.has(profile.profileId)
    ) {
      throw new ReportPlanningError("EVIDENCE_PROFILE_INVALID");
    }
    result.set(profile.profileId, profile);
  }
  return result;
}

function themeMap(themes: readonly ThemeDefinition[]): ReadonlyMap<string, ThemeDefinition> {
  const result = new Map<string, ThemeDefinition>();
  for (const theme of themes) {
    if (
      theme === null ||
      typeof theme !== "object" ||
      typeof theme.themeId !== "string" ||
      theme.themeId.length === 0 ||
      (theme.origin !== "authored" && theme.origin !== "derived") ||
      !Array.isArray(theme.complementThemeIds) ||
      !Array.isArray(theme.tensionThemeIds) ||
      result.has(theme.themeId)
    ) {
      throw new ReportPlanningError("EVIDENCE_THEME_INVALID");
    }
    result.set(theme.themeId, theme);
  }
  for (const theme of themes) {
    for (const relatedThemeId of [...theme.complementThemeIds, ...theme.tensionThemeIds]) {
      if (!result.has(relatedThemeId)) {
        throw new ReportPlanningError("EVIDENCE_THEME_REFERENCE_UNKNOWN");
      }
    }
  }
  return result;
}

function actionMap(actions: readonly ActionDefinition[]): ReadonlyMap<string, ActionDefinition> {
  const result = new Map<string, ActionDefinition>();
  for (const action of actions) {
    if (
      action === null ||
      typeof action !== "object" ||
      typeof action.actionKey !== "string" ||
      action.actionKey.length === 0 ||
      !["free", "low_cost", "paid"].includes(action.cost) ||
      !["reversible", "bounded", "irreversible"].includes(action.reversibility) ||
      !["low_risk", "high_risk"].includes(action.safety) ||
      result.has(action.actionKey)
    ) {
      throw new ReportPlanningError("EVIDENCE_ACTION_INVALID");
    }
    result.set(action.actionKey, action);
  }
  return result;
}

function factsById(facts: readonly CalculatedFact[]): ReadonlyMap<string, CalculatedFact> {
  const result = new Map<string, CalculatedFact>();
  for (const fact of facts) {
    if (result.has(fact.factId)) {
      throw new ReportPlanningError("CALCULATION_FACT_DUPLICATE");
    }
    result.set(fact.factId, fact);
  }
  return result;
}

function sourceLinksFor(
  sourceIds: readonly string[],
  sources: ReadonlyMap<string, SourceLink>,
): readonly SourceLink[] {
  if (sourceIds.length === 0) {
    throw new ReportPlanningError("EVIDENCE_SOURCE_REQUIRED");
  }
  return uniqueSorted(sourceIds).map((sourceId) => {
    const source = sources.get(sourceId);
    if (source === undefined) {
      throw new ReportPlanningError("EVIDENCE_SOURCE_UNKNOWN");
    }
    return source;
  });
}

function isUnsafeRule(rule: ResolvedDoctrineRule): boolean {
  return rule.safetyTags.some((tag) => {
    const normalized = tag.toLowerCase();
    return (
      UNSAFE_TAGS.has(normalized) ||
      /(?:coerc|credit|cure|curse|diagnos|eligib|employ|fertil|financ|gambl|health|high.?stake|housing|invest|insurance|legal|medical|medicat|money|physical.?safety|pregnan|remedy|self.?harm|suicid|treat|wealth)/u.test(
        normalized,
      )
    );
  });
}

function isSafeAction(action: ActionDefinition | undefined): action is SafeAction {
  return (
    action !== undefined &&
    action.cost !== "paid" &&
    action.reversibility === "reversible" &&
    action.safety === "low_risk"
  );
}

function isEligibleRule(
  rule: ResolvedDoctrineRule,
  actions: ReadonlyMap<string, ActionDefinition>,
): boolean {
  if (
    rule.status !== "active" ||
    rule.reviewState !== "approved" ||
    rule.confidence === "low" ||
    rule.confidence === "unresolved" ||
    rule.claimClass === "E" ||
    rule.exclusions.length > 0 ||
    isUnsafeRule(rule)
  ) {
    return false;
  }
  return (
    rule.valence !== "tension" || rule.actionKeys.some((key) => isSafeAction(actions.get(key)))
  );
}

function isCoreMetric(metricId: string): boolean {
  return CORE_METRICS.has(metricId);
}

function sectionOrder(sectionKey: ReportSectionKey): number {
  return SECTION_KEYS.indexOf(sectionKey) + 1;
}

function ruleOrder(left: ResolvedDoctrineRule, right: ResolvedDoctrineRule): number {
  const sectionDifference = sectionOrder(left.sectionKey) - sectionOrder(right.sectionKey);
  return sectionDifference !== 0
    ? sectionDifference
    : left.ruleId < right.ruleId
      ? -1
      : left.ruleId > right.ruleId
        ? 1
        : 0;
}

function candidateOrder(left: Candidate, right: Candidate): number {
  if (left.score !== right.score) {
    return right.score - left.score;
  }
  if (left.claimId < right.claimId) {
    return -1;
  }
  if (left.claimId > right.claimId) {
    return 1;
  }
  return 0;
}

function factLink(fact: CalculatedFact): FactLink {
  return {
    factId: fact.factId,
    profileId: fact.profileId,
    traceIds: uniqueSorted(fact.traceIds),
  };
}

function primaryRoot(facts: readonly CalculatedFact[]): number | null {
  const candidate = [...facts].sort((left, right) =>
    left.factId < right.factId ? -1 : left.factId > right.factId ? 1 : 0,
  )[0];
  return candidate === undefined || candidate.root === 0 ? null : candidate.root;
}

function relationshipFor(familyIds: readonly string[]): "convergence" | "unique_signal" {
  return familyIds.length >= 2 ? "convergence" : "unique_signal";
}

function valenceFor(rules: readonly ResolvedDoctrineRule[]): PlannedClaim["valence"] {
  const valences = uniqueSorted(rules.map((rule) => rule.valence));
  return valences.length === 1 ? (valences[0] as PlannedClaim["valence"]) : "contextual";
}

function buildThemeCandidate(
  themeId: string,
  groupedRules: readonly ResolvedDoctrineRule[],
  facts: ReadonlyMap<string, CalculatedFact>,
  profiles: ReadonlyMap<string, ProfileDescriptor>,
  sources: ReadonlyMap<string, SourceLink>,
): Candidate {
  const rules = [...groupedRules].sort(ruleOrder);
  const selectedFacts = uniqueSorted(rules.map((rule) => rule.factId)).map((factId) => {
    const fact = facts.get(factId);
    if (fact === undefined) {
      throw new ReportPlanningError("EVIDENCE_FACT_UNKNOWN");
    }
    return fact;
  });
  const profileIds = uniqueSorted(selectedFacts.map((fact) => fact.profileId));
  const familyIds = uniqueSorted(
    profileIds.map((profileId) => {
      const profile = profiles.get(profileId);
      if (profile === undefined) {
        throw new ReportPlanningError("EVIDENCE_PROFILE_UNKNOWN");
      }
      return profile.familyId;
    }),
  );
  const coreMetricCount = new Set(
    selectedFacts.filter((fact) => isCoreMetric(fact.metricId)).map((fact) => fact.metricId),
  ).size;
  const currentTiming = rules.some((rule) => rule.timeRelevance === "current");
  const actionable = rules.some((rule) => rule.actionKeys.length > 0);
  const highConfidence = rules.some((rule) => rule.confidence === "high");
  const lowConfidence = rules.some((rule) => rule.confidence === "low");
  const redundantClaimCount = Math.max(0, rules.length - 1);
  const score =
    25 * familyIds.length +
    12 * coreMetricCount +
    (currentTiming ? 10 : 0) +
    (actionable ? 8 : 0) +
    (highConfidence ? 5 : 0) -
    15 * redundantClaimCount -
    (lowConfidence ? 20 : 0);
  const sectionKey = currentTiming ? "personal_year" : (rules[0]?.sectionKey ?? "core_overview");
  const sourceLinks = sourceLinksFor(
    rules.flatMap((rule) => rule.sourceRefIds),
    sources,
  );
  const allowedDisplayNumbers = uniqueSorted(selectedFacts.flatMap((fact) => fact.displayTokens));
  const relationship = relationshipFor(familyIds);

  return {
    actionKeys: uniqueSorted(rules.flatMap((rule) => rule.actionKeys)),
    allowedDisplayNumbers,
    claimClass: rules.some((rule) => rule.claimClass === "D") ? "D" : (rules[0]?.claimClass ?? "G"),
    claimId: `claim.theme.${themeId}`,
    contradictionIds: [],
    contradictionResolutions: [],
    factIds: uniqueSorted(selectedFacts.map((fact) => fact.factId)),
    factLinks: selectedFacts
      .map(factLink)
      .sort((left, right) =>
        left.factId < right.factId ? -1 : left.factId > right.factId ? 1 : 0,
      ),
    independentProfileFamilyIds: familyIds,
    isTiming: currentTiming,
    origin: "authored",
    primaryRoot: primaryRoot(selectedFacts),
    profileIds,
    relationship,
    ruleIds: uniqueSorted(rules.map((rule) => rule.ruleId)),
    score,
    sectionKey,
    sourceLinks,
    themeId,
    valence: valenceFor(rules),
    wordBudget: relationship === "convergence" ? 100 : 80,
  };
}

function buildContradictionCandidates(
  input: ReportPlanningInput,
  eligibleRules: readonly ResolvedDoctrineRule[],
  facts: ReadonlyMap<string, CalculatedFact>,
  sources: ReadonlyMap<string, SourceLink>,
): Candidate[] {
  const rulesByFact = new Map<string, ResolvedDoctrineRule[]>();
  for (const rule of eligibleRules) {
    const group = rulesByFact.get(rule.factId) ?? [];
    group.push(rule);
    rulesByFact.set(rule.factId, group);
  }

  return [...input.evidence.contradictions]
    .sort((left, right) =>
      left.contradictionId < right.contradictionId
        ? -1
        : left.contradictionId > right.contradictionId
          ? 1
          : 0,
    )
    .flatMap((contradiction) => {
      const matchingRules = contradiction.factIds.flatMap(
        (factId) => rulesByFact.get(factId) ?? [],
      );
      const supportedFactIds = uniqueSorted(matchingRules.map((rule) => rule.factId));
      if (supportedFactIds.length !== uniqueSorted(contradiction.factIds).length) {
        return [];
      }
      const selectedFacts = supportedFactIds.map((factId) => {
        const fact = facts.get(factId);
        if (fact === undefined) {
          throw new ReportPlanningError("EVIDENCE_FACT_UNKNOWN");
        }
        return fact;
      });
      const profileIds = uniqueSorted(selectedFacts.map((fact) => fact.profileId));
      const sourceLinks = sourceLinksFor(
        [...contradiction.sourceRefIds, ...matchingRules.flatMap((rule) => rule.sourceRefIds)],
        sources,
      );
      return [
        {
          actionKeys: [],
          allowedDisplayNumbers: uniqueSorted(selectedFacts.flatMap((fact) => fact.displayTokens)),
          claimClass: "G" as const,
          claimId: `claim.contradiction.${contradiction.contradictionId}`,
          contradictionIds: [contradiction.contradictionId],
          contradictionResolutions: [contradiction.resolution],
          factIds: uniqueSorted(selectedFacts.map((fact) => fact.factId)),
          factLinks: selectedFacts
            .map(factLink)
            .sort((left, right) =>
              left.factId < right.factId ? -1 : left.factId > right.factId ? 1 : 0,
            ),
          independentProfileFamilyIds: [],
          isTiming: false,
          origin: "authored" as const,
          primaryRoot: null,
          profileIds,
          relationship: "contradiction" as const,
          ruleIds: uniqueSorted(matchingRules.map((rule) => rule.ruleId)),
          score: 0,
          sectionKey: "methodology_appendix" as const,
          sourceLinks,
          themeId: `contradiction.${contradiction.contradictionId}`,
          valence: "contextual" as const,
          wordBudget: 100,
        },
      ];
    });
}

function containsJohari9x9Pair(candidate: Candidate): boolean {
  return (
    candidate.profileIds.length === 1 &&
    candidate.profileIds[0] === "indian_johari_1990_v1" &&
    candidate.factIds.length >= 2
  );
}

function buildComplementCandidates(
  candidates: readonly Candidate[],
  themes: ReadonlyMap<string, ThemeDefinition>,
): Candidate[] {
  const result: Candidate[] = [];
  const seen = new Set<string>();
  const authored = candidates.filter((candidate) => candidate.origin === "authored");
  for (const candidate of authored) {
    const theme = themes.get(candidate.themeId);
    if (theme === undefined) {
      continue;
    }
    for (const relatedThemeId of theme.complementThemeIds) {
      const related = authored.find((item) => item.themeId === relatedThemeId);
      if (
        related === undefined ||
        containsJohari9x9Pair(candidate) ||
        containsJohari9x9Pair(related)
      ) {
        continue;
      }
      const [left, right] = sortStrings([candidate.themeId, related.themeId]);
      if (left === undefined || right === undefined) {
        continue;
      }
      const key = `${left}.${right}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      result.push({
        actionKeys: [],
        allowedDisplayNumbers: uniqueSorted([
          ...candidate.allowedDisplayNumbers,
          ...related.allowedDisplayNumbers,
        ]),
        claimClass: "G",
        claimId: `claim.complement.${key}`,
        contradictionIds: [],
        contradictionResolutions: [],
        factIds: uniqueSorted([...candidate.factIds, ...related.factIds]),
        factLinks: [...candidate.factLinks, ...related.factLinks].sort((leftLink, rightLink) =>
          leftLink.factId < rightLink.factId ? -1 : leftLink.factId > rightLink.factId ? 1 : 0,
        ),
        independentProfileFamilyIds: uniqueSorted([
          ...candidate.independentProfileFamilyIds,
          ...related.independentProfileFamilyIds,
        ]),
        isTiming: false,
        origin: "derived",
        primaryRoot: null,
        profileIds: uniqueSorted([...candidate.profileIds, ...related.profileIds]),
        relationship: "complement",
        ruleIds: uniqueSorted([...candidate.ruleIds, ...related.ruleIds]),
        score: 0,
        sectionKey: "repeated_strengths",
        sourceLinks: [...candidate.sourceLinks, ...related.sourceLinks].sort(
          (leftLink, rightLink) =>
            leftLink.sourceId < rightLink.sourceId
              ? -1
              : leftLink.sourceId > rightLink.sourceId
                ? 1
                : 0,
        ),
        themeId: `complement.${key}`,
        valence: "contextual",
        wordBudget: 80,
      });
    }
  }
  return result;
}

function reservedFactsForSection(
  sectionKey: ReportSectionKey,
  facts: readonly CalculatedFact[],
): readonly string[] {
  const metricIds = (() => {
    switch (sectionKey) {
      case "core_overview":
        return CORE_METRICS;
      case "life_path":
        return new Set(["life_path"]);
      case "birthday_psychic_comparison":
        return new Set(["birthday", "psychic_number", "destiny_number"]);
      case "current_name_comparison":
        return new Set(["name_number"]);
      case "lo_shu_raw_grid":
      case "lo_shu_augmented_comparison":
        return new Set(["grid"]);
      case "personal_year":
        return new Set(["personal_year"]);
      case "personal_months":
        return new Set([
          "personal_month.01",
          "personal_month.02",
          "personal_month.03",
          "personal_month.04",
          "personal_month.05",
          "personal_month.06",
          "personal_month.07",
          "personal_month.08",
          "personal_month.09",
          "personal_month.10",
          "personal_month.11",
          "personal_month.12",
        ]);
      case "methodology_appendix":
        return null;
      default:
        return new Set<string>();
    }
  })();
  return uniqueSorted(
    facts
      .filter((fact) => metricIds === null || metricIds.has(fact.metricId))
      .map((fact) => fact.factId),
  );
}

function sectionPlan(
  claims: readonly Candidate[],
  facts: readonly CalculatedFact[],
): PlannedSection[] {
  return SECTION_KEYS.map((key, index) => ({
    claimIds: claims
      .filter((claim) => claim.sectionKey === key)
      .map((claim) => claim.claimId)
      .sort(),
    key,
    order: index + 1,
    reserved: true as const,
    reservedFactIds: reservedFactsForSection(key, facts),
    wordBudget: SECTION_WORD_BUDGETS[key],
  }));
}

function selectUnderSectionBudgets(candidates: readonly Candidate[]): Candidate[] {
  const selected: Candidate[] = [];
  const used = new Map<ReportSectionKey, number>();
  const direct = candidates.filter((candidate) => candidate.score > 0).sort(candidateOrder);
  const supplementary = candidates
    .filter((candidate) => candidate.score === 0)
    .sort((left, right) =>
      left.claimId < right.claimId ? -1 : left.claimId > right.claimId ? 1 : 0,
    );
  for (const candidate of [...direct, ...supplementary]) {
    const budget = used.get(candidate.sectionKey) ?? 0;
    if (budget + candidate.wordBudget <= SECTION_WORD_BUDGETS[candidate.sectionKey]) {
      selected.push(candidate);
      used.set(candidate.sectionKey, budget + candidate.wordBudget);
    }
  }
  return selected;
}

function balanceNegativeValence(candidates: readonly Candidate[]): Candidate[] {
  let consecutiveTensions = 0;
  return candidates.filter((candidate) => {
    if (candidate.valence !== "tension") {
      consecutiveTensions = 0;
      return true;
    }
    if (consecutiveTensions >= 2) {
      return false;
    }
    consecutiveTensions += 1;
    return true;
  });
}

function balanceRoots(candidates: readonly Candidate[], policy: EffectivePolicy): Candidate[] {
  let selected = [...candidates];
  while (true) {
    const total = selected.reduce((sum, candidate) => sum + candidate.wordBudget, 0);
    if (total === 0) {
      return selected;
    }
    const byRoot = new Map<number, Candidate[]>();
    for (const candidate of selected) {
      if (candidate.primaryRoot === null) {
        continue;
      }
      const group = byRoot.get(candidate.primaryRoot) ?? [];
      group.push(candidate);
      byRoot.set(candidate.primaryRoot, group);
    }
    const overrepresented = [...byRoot.entries()]
      .map(([root, group]) => ({
        root,
        group,
        words: group.reduce((sum, candidate) => sum + candidate.wordBudget, 0),
      }))
      .filter((entry) => entry.words / total > policy.maxRootWordShare)
      .sort((left, right) => right.words - left.words || left.root - right.root)[0];
    if (overrepresented === undefined) {
      return selected;
    }
    const removable = [...overrepresented.group]
      .filter((candidate) => candidate.relationship === "unique_signal")
      .sort((left, right) => left.score - right.score || candidateOrder(left, right))[0];
    if (removable === undefined) {
      return selected;
    }
    selected = selected.filter((candidate) => candidate.claimId !== removable.claimId);
  }
}

function buildActions(
  claims: readonly Candidate[],
  actions: ReadonlyMap<string, ActionDefinition>,
  maxActions: number,
): PlannedAction[] {
  const actionClaims = new Map<string, Candidate[]>();
  for (const claim of claims) {
    for (const actionKey of claim.actionKeys) {
      const action = actions.get(actionKey);
      if (!isSafeAction(action)) {
        continue;
      }
      const group = actionClaims.get(actionKey) ?? [];
      group.push(claim);
      actionClaims.set(actionKey, group);
    }
  }
  return [...actionClaims.entries()]
    .sort(([leftKey, leftClaims], [rightKey, rightClaims]) => {
      const leftSupportsTension = leftClaims.some((claim) => claim.valence === "tension");
      const rightSupportsTension = rightClaims.some((claim) => claim.valence === "tension");
      if (leftSupportsTension !== rightSupportsTension) {
        return leftSupportsTension ? -1 : 1;
      }
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    })
    .slice(0, maxActions)
    .map(([actionKey, relatedClaims]) => {
      const action = actions.get(actionKey);
      if (!isSafeAction(action)) {
        throw new ReportPlanningError("PLAN_ACTION_SAFETY");
      }
      return {
        actionKey,
        cost: action.cost,
        claimIds: relatedClaims.map((claim) => claim.claimId).sort(),
        reversibility: action.reversibility,
        ruleIds: uniqueSorted(relatedClaims.flatMap((claim) => claim.ruleIds)),
        sourceLinks: relatedClaims
          .flatMap((claim) => claim.sourceLinks)
          .sort((left, right) =>
            left.sourceId < right.sourceId ? -1 : left.sourceId > right.sourceId ? 1 : 0,
          ),
      };
    });
}

function statisticsFor(candidates: readonly Candidate[]): PlanStatistics {
  const rootWordBudgets: Record<string, number> = {};
  for (const candidate of candidates) {
    if (candidate.primaryRoot !== null) {
      const root = String(candidate.primaryRoot);
      rootWordBudgets[root] = (rootWordBudgets[root] ?? 0) + candidate.wordBudget;
    }
  }
  const totalInterpretiveWordBudget = candidates.reduce(
    (sum, candidate) => sum + candidate.wordBudget,
    0,
  );
  return {
    independentProfileFamilyCount: new Set(
      candidates.flatMap((candidate) => candidate.independentProfileFamilyIds),
    ).size,
    rootWordBudgets: Object.fromEntries(
      Object.entries(rootWordBudgets).sort(([left], [right]) =>
        left < right ? -1 : left > right ? 1 : 0,
      ),
    ),
    timingWordBudget: candidates
      .filter((candidate) => candidate.isTiming)
      .reduce((sum, candidate) => sum + candidate.wordBudget, 0),
    totalInterpretiveWordBudget,
  };
}

function toPlannedClaim(candidate: Candidate): PlannedClaim {
  const {
    actionKeys: _actionKeys,
    isTiming: _isTiming,
    primaryRoot: _primaryRoot,
    ...claim
  } = candidate;
  return claim;
}

function validateEvidence(input: ReportPlanningInput): {
  readonly actions: ReadonlyMap<string, ActionDefinition>;
  readonly facts: ReadonlyMap<string, CalculatedFact>;
  readonly profiles: ReadonlyMap<string, ProfileDescriptor>;
  readonly sources: ReadonlyMap<string, SourceLink>;
  readonly themes: ReadonlyMap<string, ThemeDefinition>;
} {
  if (input === null || typeof input !== "object" || input.schemaVersion !== "1.0.0") {
    throw new ReportPlanningError("PLANNER_INPUT_SCHEMA_INVALID");
  }
  const bundleValidation = validateBundle(input.bundle);
  if (!bundleValidation.valid) {
    throw new ReportPlanningError("CALCULATION_BUNDLE_INVALID");
  }
  if (
    input.evidence === null ||
    typeof input.evidence !== "object" ||
    input.evidence.schemaVersion !== "1.0.0" ||
    typeof input.evidence.doctrineVersion !== "string" ||
    input.evidence.doctrineVersion.length === 0 ||
    !isSha256Hash(input.evidence.doctrineManifestHash)
  ) {
    throw new ReportPlanningError("EVIDENCE_BUNDLE_INVALID");
  }
  const facts = factsById(input.bundle.facts);
  const sources = sourceMap(input.evidence.sources);
  const profiles = profileMap(input.evidence.profileCatalog);
  const themes = themeMap(input.evidence.themeOntology);
  const actions = actionMap(input.evidence.actions);
  const ruleIds = new Set<string>();

  for (const rule of input.evidence.resolvedRules) {
    if (
      rule === null ||
      typeof rule !== "object" ||
      typeof rule.ruleId !== "string" ||
      rule.ruleId.length === 0 ||
      ruleIds.has(rule.ruleId) ||
      !facts.has(rule.factId) ||
      !profiles.has(rule.profileId) ||
      rule.sourceRefIds.length === 0 ||
      rule.themeIds.length === 0 ||
      !SECTION_KEYS.includes(rule.sectionKey)
    ) {
      throw new ReportPlanningError(
        !facts.has(rule.factId) ? "EVIDENCE_FACT_UNKNOWN" : "EVIDENCE_RULE_INVALID",
      );
    }
    const fact = facts.get(rule.factId);
    if (fact === undefined) {
      throw new ReportPlanningError("EVIDENCE_FACT_UNKNOWN");
    }
    if (fact.profileId !== rule.profileId) {
      throw new ReportPlanningError("EVIDENCE_PROFILE_FACT_MISMATCH");
    }
    ruleIds.add(rule.ruleId);
    sourceLinksFor(rule.sourceRefIds, sources);
    for (const themeId of rule.themeIds) {
      const theme = themes.get(themeId);
      if (theme === undefined) {
        throw new ReportPlanningError("EVIDENCE_THEME_UNKNOWN");
      }
      if (theme.origin !== "authored") {
        throw new ReportPlanningError("EVIDENCE_DERIVED_THEME_RULE");
      }
    }
    for (const actionKey of rule.actionKeys) {
      if (!actions.has(actionKey)) {
        throw new ReportPlanningError("EVIDENCE_ACTION_UNKNOWN");
      }
    }
  }

  for (const contradiction of input.evidence.contradictions) {
    if (
      contradiction.factIds.length < 2 ||
      contradiction.profileIds.length < 2 ||
      contradiction.sourceRefIds.length === 0 ||
      typeof contradiction.resolution !== "string" ||
      contradiction.resolution.length === 0
    ) {
      throw new ReportPlanningError("EVIDENCE_CONTRADICTION_INVALID");
    }
    for (const factId of contradiction.factIds) {
      if (!facts.has(factId)) {
        throw new ReportPlanningError("EVIDENCE_FACT_UNKNOWN");
      }
    }
    sourceLinksFor(contradiction.sourceRefIds, sources);
  }

  return { actions, facts, profiles, sources, themes };
}

/** Pure deterministic planning from validated engine facts and doctrine-worker evidence. */
export function planReport(
  input: ReportPlanningInput,
  requestedPolicy?: PlannerPolicy,
): ReportPlan {
  const policy = policyFor(requestedPolicy);
  const { actions, facts, profiles, sources, themes } = validateEvidence(input);
  const eligibleRules = input.evidence.resolvedRules.filter((rule) =>
    isEligibleRule(rule, actions),
  );
  const byTheme = new Map<string, ResolvedDoctrineRule[]>();
  for (const rule of eligibleRules) {
    for (const themeId of rule.themeIds) {
      const group = byTheme.get(themeId) ?? [];
      group.push(rule);
      byTheme.set(themeId, group);
    }
  }

  const themeCandidates = [...byTheme.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([themeId, rules]) =>
      buildThemeCandidate(
        themeId,
        // A theme is expressed once; all supporting rules remain provenance rather than being
        // truncated by collection order. The cap limits claim count, not independent evidence.
        rules,
        facts,
        profiles,
        sources,
      ),
    );
  const contradictions = buildContradictionCandidates(input, eligibleRules, facts, sources);
  const complements = buildComplementCandidates(themeCandidates, themes);
  const sectionLimited = selectUnderSectionBudgets([
    ...themeCandidates,
    ...contradictions,
    ...complements,
  ]);
  const valenceBalanced = balanceNegativeValence(sectionLimited);
  const balanced = balanceRoots(valenceBalanced, policy);
  const statistics = statisticsFor(balanced);

  if (statistics.independentProfileFamilyCount < policy.minimumIndependentProfileFamilies) {
    throw new ReportPlanningError("INSUFFICIENT_INDEPENDENT_PROFILE_FAMILIES");
  }
  if (
    statistics.totalInterpretiveWordBudget > 0 &&
    statistics.timingWordBudget / statistics.totalInterpretiveWordBudget > policy.maxTimingWordShare
  ) {
    throw new ReportPlanningError("TIMING_WORD_BUDGET_EXCEEDED");
  }

  const plannedClaims = balanced.map(toPlannedClaim);
  const plannedActions = buildActions(balanced, actions, policy.maxActions);
  const profileMethods = uniqueSorted(balanced.flatMap((candidate) => candidate.profileIds)).map(
    (profileId) => {
      const profile = profiles.get(profileId);
      if (profile === undefined) {
        throw new ReportPlanningError("EVIDENCE_PROFILE_UNKNOWN");
      }
      return profile;
    },
  );
  const planWithoutHash = {
    actions: plannedActions,
    claims: plannedClaims,
    doctrineManifestHash: input.evidence.doctrineManifestHash,
    doctrineVersion: input.evidence.doctrineVersion,
    engineVersion: input.bundle.engineVersion,
    inputHash: input.bundle.inputHash,
    plannerVersion: REPORT_PLANNER_VERSION,
    profileMethods,
    reservations: [...MANDATORY_RESERVATIONS],
    schemaVersion: REPORT_PLAN_SCHEMA_VERSION,
    sections: sectionPlan(balanced, input.bundle.facts),
    statistics,
  } as const;
  const plan: ReportPlan = {
    ...planWithoutHash,
    planHash: canonicalHash(planWithoutHash),
  };
  const validation = validateReportPlan(plan, requestedPolicy);
  if (!validation.valid) {
    throw new ReportPlanningError(validation.diagnostics[0] ?? "PLAN_VALIDATION_FAILED");
  }
  return deepFreeze(plan);
}

/** Validates the durable plan boundary without invoking arithmetic, doctrine, a database, or a model. */
export function validateReportPlan(
  plan: unknown,
  requestedPolicy?: PlannerPolicy,
): PlanValidationResult {
  const policy = policyFor(requestedPolicy);
  const diagnostics: string[] = [];
  if (plan === null || typeof plan !== "object" || Array.isArray(plan)) {
    return { diagnostics: Object.freeze(["PLAN_OBJECT_REQUIRED"]), valid: false };
  }
  const candidate = plan as Partial<ReportPlan>;
  if (candidate.schemaVersion !== REPORT_PLAN_SCHEMA_VERSION) {
    diagnostics.push("PLAN_SCHEMA_VERSION");
  }
  if (candidate.plannerVersion !== REPORT_PLANNER_VERSION) {
    diagnostics.push("PLAN_PLANNER_VERSION");
  }
  if (!Array.isArray(candidate.sections) || candidate.sections.length !== SECTION_KEYS.length) {
    diagnostics.push("PLAN_SECTION_CARDINALITY");
  } else if (
    candidate.sections.some(
      (section, index) =>
        section.key !== SECTION_KEYS[index] ||
        section.order !== index + 1 ||
        section.reserved !== true ||
        !Array.isArray(section.reservedFactIds),
    )
  ) {
    diagnostics.push("PLAN_SECTION_ORDER");
  } else if (
    candidate.sections.find((section) => section.key === "core_overview")?.reservedFactIds
      .length === 0
  ) {
    diagnostics.push("PLAN_CORE_FACT_RESERVATION");
  }
  if (
    !Array.isArray(candidate.reservations) ||
    MANDATORY_RESERVATIONS.some((reservation) => !candidate.reservations?.includes(reservation))
  ) {
    diagnostics.push("PLAN_MANDATORY_RESERVATION");
  }
  if (
    !Array.isArray(candidate.profileMethods) ||
    candidate.profileMethods.length === 0 ||
    new Set(candidate.profileMethods.map((profile) => profile.profileId)).size !==
      candidate.profileMethods.length
  ) {
    diagnostics.push("PLAN_PROFILE_METHODS");
  }
  if (!Array.isArray(candidate.claims)) {
    diagnostics.push("PLAN_CLAIMS_REQUIRED");
  } else {
    const claimIds = new Set<string>();
    for (const claim of candidate.claims) {
      if (
        claimIds.has(claim.claimId) ||
        claim.factIds.length === 0 ||
        claim.factLinks.length === 0 ||
        claim.ruleIds.length === 0 ||
        claim.sourceLinks.length === 0 ||
        claim.factLinks.some((link: FactLink) => link.traceIds.length === 0)
      ) {
        diagnostics.push("PLAN_CLAIM_PROVENANCE");
        break;
      }
      claimIds.add(claim.claimId);
    }
    let consecutiveTensions = 0;
    for (const claim of candidate.claims) {
      consecutiveTensions = claim.valence === "tension" ? consecutiveTensions + 1 : 0;
      if (consecutiveTensions > 2) {
        diagnostics.push("PLAN_NEGATIVE_BALANCE");
        break;
      }
    }
    if (Array.isArray(candidate.sections)) {
      for (const section of candidate.sections) {
        const used = candidate.claims
          .filter((claim) => claim.sectionKey === section.key)
          .reduce((sum, claim) => sum + claim.wordBudget, 0);
        if (used > section.wordBudget) {
          diagnostics.push("PLAN_SECTION_WORD_BUDGET");
          break;
        }
      }
    }
  }
  const planActions = candidate.actions as readonly PlannedAction[] | undefined;
  if (!Array.isArray(planActions) || planActions.length > policy.maxActions) {
    diagnostics.push("PLAN_ACTION_LIMIT");
  } else if (
    planActions.some(
      (action) =>
        action.cost === "paid" ||
        action.reversibility !== "reversible" ||
        action.ruleIds.length === 0 ||
        action.sourceLinks.length === 0,
    )
  ) {
    diagnostics.push("PLAN_ACTION_SAFETY");
  } else if (Array.isArray(candidate.claims)) {
    for (const claim of candidate.claims.filter((claim) => claim.valence === "tension")) {
      if (!planActions.some((action) => action.claimIds.includes(claim.claimId))) {
        diagnostics.push("PLAN_TENSION_WITHOUT_ACTION");
        break;
      }
    }
  }
  if (
    candidate.statistics === undefined ||
    candidate.statistics.totalInterpretiveWordBudget <= 0 ||
    candidate.statistics.timingWordBudget / candidate.statistics.totalInterpretiveWordBudget >
      policy.maxTimingWordShare ||
    Math.max(0, ...Object.values(candidate.statistics.rootWordBudgets)) >
      candidate.statistics.totalInterpretiveWordBudget * policy.maxRootWordShare
  ) {
    diagnostics.push("PLAN_BALANCE_LIMIT");
  }
  if (typeof candidate.planHash !== "string" || !isSha256Hash(candidate.planHash)) {
    diagnostics.push("PLAN_HASH_INVALID");
  } else {
    const { planHash: _planHash, ...withoutHash } = candidate as ReportPlan;
    if (canonicalHash(withoutHash) !== candidate.planHash) {
      diagnostics.push("PLAN_HASH_MISMATCH");
    }
  }
  return { diagnostics: Object.freeze(uniqueSorted(diagnostics)), valid: diagnostics.length === 0 };
}

export const REPORT_SECTION_WORD_BUDGETS = SECTION_WORD_BUDGETS;
