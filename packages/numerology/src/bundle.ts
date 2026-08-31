import { mapLetters, WESTERN_ALPHABET } from "./alphabets";
import { cheiroDateMetrics, cheiroName } from "./cheiro";
import { parseCivilDate, yearFromAsOfDate } from "./date";
import { latinReadinessWarning, normalizeName, type NormalizedName } from "./identity";
import { johariCore, johariNameNumber, johariProjectedYear, planetForRoot } from "./johari";
import { loShuAugmentedGrid, loShuRawGrid } from "./lo-shu";
import { FORMULA_MANIFEST_HASH } from "./manifest";
import { reduceWithPolicy } from "./reduction";
import { canonicalHash } from "./stable-json";
import {
  ENGINE_VERSION,
  PROFILE_IDS,
  type CalculatedFact,
  type CalculationBundle,
  type CalculationRequest,
  type BundleValidationResult,
  type EngineWarning,
  type NameKind,
  type NumericTrace,
  type ProfileId,
} from "./types";
import {
  balliettBirthDate,
  balliettName,
  hasAmbiguousWesternY,
  westernAttitude,
  westernBirthday,
  westernBridges,
  westernDigitSumLifePath,
  westernExpression,
  westernHiddenPassion,
  westernKarmicLessons,
  westernLifePath,
  westernMaturity,
  westernPersonalMonths,
  westernPersonalYear,
  westernPersonality,
  westernSoulUrge,
  type DateReductionResult,
  type SimpleNumberResult,
  type WesternNameMetricResult,
} from "./western";

const PROFILE_ID_SET = new Set<string>(PROFILE_IDS);
const TRACE_OPERATIONS = new Set<NumericTrace["operation"]>([
  "count_digits",
  "difference",
  "map_letters",
  "reduce",
  "sum",
]);
const WARNING_CODES = new Set<EngineWarning["code"]>([
  "ENGINE_LATIN_NAME_REQUIRED",
  "ENGINE_TRANSLITERATION_CONFIRMATION_REQUIRED",
  "JOHARI_PREDAWN_BOUNDARY_EXCLUDED",
  "MISSING_NAME_USE",
  "NAME_METRIC_NOT_APPLICABLE",
  "UNSUPPORTED_NAME_CHARACTER",
  "WESTERN_Y_CLASSIFICATION_REQUIRED",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isSha256Hash(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/u.test(value);
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isTraceInput(value: unknown): value is number | string {
  return typeof value === "string" || isNonNegativeSafeInteger(value);
}

const BIRTH_NAME_KINDS = new Set<NameKind>(["birth_full", "birth_legal", "engine_latin"]);
const POPULAR_NAME_KINDS = new Set<NameKind>([
  "popular",
  "usual",
  "nickname",
  "professional",
  "stage",
  "current_full",
  "current_legal",
  "engine_latin",
]);

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

class BundleBuilder {
  public readonly facts: CalculatedFact[] = [];
  public readonly traces: NumericTrace[] = [];
  public readonly warnings: EngineWarning[] = [];

  #traceCounter = 0;
  #warningCounter = 0;

  addTrace(
    profileId: ProfileId,
    metricId: string,
    operation: NumericTrace["operation"],
    inputs: readonly (number | string)[],
    intermediates: readonly number[],
    output: number,
    policyId: string,
  ): string {
    this.#traceCounter += 1;
    const traceId = `${profileId}.${metricId}.trace.${this.#traceCounter}`;
    this.traces.push(
      deepFreeze({
        inputs: [...inputs],
        intermediates: [...intermediates],
        operation,
        output,
        policyId,
        traceId,
      }),
    );
    return traceId;
  }

  addWarning(warning: Omit<EngineWarning, "warningId">): void {
    this.#warningCounter += 1;
    this.warnings.push(deepFreeze({ ...warning, warningId: `warning.${this.#warningCounter}` }));
  }

  addFact(fact: CalculatedFact): void {
    this.facts.push(deepFreeze(fact));
  }
}

function displayTokens(root: number, compound?: number, master?: 11 | 22 | 33): readonly string[] {
  const tokens = new Set<string>();
  if (compound !== undefined) {
    tokens.add(String(compound));
  }
  if (master !== undefined) {
    tokens.add(String(master));
  }
  tokens.add(String(root));
  return Object.freeze([...tokens]);
}

function traceReduction(
  builder: BundleBuilder,
  profileId: ProfileId,
  metricId: string,
  result: Pick<SimpleNumberResult, "compound" | "finalReduction" | "root">,
): readonly string[] {
  return Object.freeze([
    builder.addTrace(
      profileId,
      metricId,
      "reduce",
      [result.compound],
      result.finalReduction.steps.slice(1),
      result.root,
      result.finalReduction.preservedMaster === null
        ? `${profileId}.${metricId}.reduce`
        : `${profileId}.${metricId}.reduce.master`,
    ),
  ]);
}

function addNumberFact(
  builder: BundleBuilder,
  profileId: ProfileId,
  metricId: string,
  result: Pick<
    SimpleNumberResult,
    "compound" | "finalReduction" | "karmicDebts" | "preservedMaster" | "root"
  >,
  metadata?: Record<string, unknown>,
): void {
  const traceIds = traceReduction(builder, profileId, metricId, result);
  const master = result.preservedMaster ?? undefined;
  builder.addFact({
    compound: result.compound,
    displayTokens: displayTokens(result.root, result.compound, master),
    factId: `${profileId}.${metricId}`,
    ...(result.karmicDebts.length > 0
      ? { karmicDebts: Object.freeze([...result.karmicDebts]) }
      : {}),
    ...(master !== undefined ? { master } : {}),
    ...(metadata !== undefined ? { metadata: deepFreeze(metadata) } : {}),
    metricId,
    profileId,
    root: result.root,
    traceIds,
  });
}

function simpleNumberResult(compound: number, policyId: string): SimpleNumberResult {
  const finalReduction = reduceWithPolicy(compound, { masters: [], policyId });
  return {
    compound,
    finalReduction,
    karmicDebts: [],
    preservedMaster: null,
    root: finalReduction.output,
  };
}

function addDateReductionFact(
  builder: BundleBuilder,
  profileId: ProfileId,
  metricId: string,
  result: DateReductionResult,
): void {
  const componentTraceIds = result.componentReductions.map((component, index) =>
    builder.addTrace(
      profileId,
      metricId,
      "reduce",
      [component.compound],
      component.steps.slice(1),
      component.output,
      `${profileId}.${metricId}.component.${index + 1}`,
    ),
  );
  const sumTraceId = builder.addTrace(
    profileId,
    metricId,
    "sum",
    result.componentOutputs,
    [],
    result.compound,
    `${profileId}.${metricId}.sum-components`,
  );
  const finalTraceId = builder.addTrace(
    profileId,
    metricId,
    "reduce",
    [result.compound],
    result.finalReduction.steps.slice(1),
    result.root,
    `${profileId}.${metricId}.final`,
  );
  const master = result.preservedMaster ?? undefined;
  builder.addFact({
    compound: result.compound,
    displayTokens: displayTokens(result.root, result.compound, master),
    factId: `${profileId}.${metricId}`,
    ...(result.karmicDebts.length > 0
      ? { karmicDebts: Object.freeze([...result.karmicDebts]) }
      : {}),
    ...(master !== undefined ? { master } : {}),
    metadata: deepFreeze({ componentOutputs: [...result.componentOutputs] }),
    metricId,
    profileId,
    root: result.root,
    traceIds: Object.freeze([...componentTraceIds, sumTraceId, finalTraceId]),
  });
}

function addNameFact(
  builder: BundleBuilder,
  profileId: ProfileId,
  metricId: string,
  result: WesternNameMetricResult,
): void {
  const tokenTraceIds = result.tokenReductions.map((token, index) =>
    builder.addTrace(
      profileId,
      metricId,
      "reduce",
      [result.tokenCompounds[index] ?? 0],
      token.steps.slice(1),
      token.output,
      `${profileId}.${metricId}.token.${index + 1}`,
    ),
  );
  const sumTraceId = builder.addTrace(
    profileId,
    metricId,
    "sum",
    result.tokenOutputs,
    [],
    result.total,
    `${profileId}.${metricId}.sum-token-roots`,
  );
  const finalTraceId = builder.addTrace(
    profileId,
    metricId,
    "reduce",
    [result.total],
    result.finalReduction.steps.slice(1),
    result.root,
    `${profileId}.${metricId}.final`,
  );
  const master = result.preservedMaster ?? undefined;
  builder.addFact({
    compound: result.compound,
    displayTokens: displayTokens(result.root, result.compound, master),
    factId: `${profileId}.${metricId}`,
    ...(result.karmicDebts.length > 0
      ? { karmicDebts: Object.freeze([...result.karmicDebts]) }
      : {}),
    ...(master !== undefined ? { master } : {}),
    metadata: deepFreeze({
      tokenCompounds: [...result.tokenCompounds],
      tokenOutputs: [...result.tokenOutputs],
    }),
    metricId,
    profileId,
    root: result.root,
    traceIds: Object.freeze([...tokenTraceIds, sumTraceId, finalTraceId]),
  });
}

function normalizeNames(request: CalculationRequest): readonly NormalizedName[] {
  const ids = new Set<string>();
  return Object.freeze(
    request.names.map((name) => {
      if (!isRecord(name)) {
        throw new RangeError("Each name input must be an object.");
      }
      const nameInput = name as unknown as CalculationRequest["names"][number];
      if (ids.has(nameInput.id)) {
        throw new RangeError(`Duplicate name id: ${nameInput.id}.`);
      }
      ids.add(nameInput.id);
      return normalizeName(nameInput);
    }),
  );
}

function findName(
  names: readonly NormalizedName[],
  kinds: ReadonlySet<NameKind>,
): NormalizedName | null {
  return names.find((name) => kinds.has(name.kind)) ?? null;
}

function calculationTextForName(
  builder: BundleBuilder,
  name: NormalizedName | null,
  profileId: ProfileId,
  purpose: "birth" | "popular",
): string | null {
  if (name === null) {
    builder.addWarning({
      code: "MISSING_NAME_USE",
      message: `No ${purpose} name view was supplied; name-based metrics were not calculated.`,
      policyId: "identity.name-use-required.v1",
      profileId,
      severity: "warning",
    });
    return null;
  }

  const latinWarning = latinReadinessWarning(name, "placeholder");
  if (latinWarning !== null) {
    builder.addWarning({ ...latinWarning, profileId });
    return null;
  }

  const text = name.calculationText;
  if (text === null) {
    return null;
  }
  const unsupported = mapLetters(text, WESTERN_ALPHABET).unsupported;
  if (unsupported.length > 0) {
    builder.addWarning({
      code: "UNSUPPORTED_NAME_CHARACTER",
      inputRef: `name:${name.id}`,
      message: "Name contains unsupported Latin letters or symbols; no name number was calculated.",
      metadata: { count: unsupported.length },
      policyId: "identity.no-silent-transliteration.v1",
      profileId,
      severity: "warning",
    });
    return null;
  }
  return text;
}

function addUnsupportedYWarnings(
  builder: BundleBuilder,
  profileId: ProfileId,
  name: NormalizedName,
): boolean {
  const missing = hasAmbiguousWesternY(name.calculationText ?? "", name.yClassifications);
  if (missing.length === 0) {
    return false;
  }
  builder.addWarning({
    code: "WESTERN_Y_CLASSIFICATION_REQUIRED",
    inputRef: `name:${name.id}`,
    message:
      "Western vowel/consonant metrics require occurrence-level Y classification and were skipped.",
    metadata: { count: missing.length },
    policyId: "identity.y-occurrence-classification.v1",
    profileId,
    severity: "warning",
  });
  return true;
}

function addOptionalWesternNameFact(
  builder: BundleBuilder,
  profileId: ProfileId,
  metricId: "soul_urge" | "personality",
  name: NormalizedName,
  calculate: () => WesternNameMetricResult,
): WesternNameMetricResult | null {
  try {
    return calculate();
  } catch (error) {
    if (
      !(error instanceof RangeError) ||
      error.message !== "The requested name metric has no applicable letters."
    ) {
      throw error;
    }
    builder.addWarning({
      code: "NAME_METRIC_NOT_APPLICABLE",
      inputRef: `name:${name.id}`,
      message: `Western ${metricId.replace("_", " ")} has no applicable letters in this name view.`,
      metadata: { metricId },
      policyId: "western_decoz_v1.empty-name-subset.v1",
      profileId,
      severity: "info",
    });
    return null;
  }
}

function addWesternProfile(
  builder: BundleBuilder,
  request: CalculationRequest,
  names: readonly NormalizedName[],
): void {
  const profileId = "western_decoz_v1";
  const lifePath = westernLifePath(request.civilDate);
  addDateReductionFact(builder, profileId, "life_path", lifePath);
  addNumberFact(builder, profileId, "birthday", westernBirthday(request.civilDate));
  addNumberFact(builder, profileId, "attitude", westernAttitude(request.civilDate));

  const birthName = findName(names, BIRTH_NAME_KINDS);
  const birthNameText = calculationTextForName(builder, birthName, profileId, "birth");
  let expression: WesternNameMetricResult | null = null;
  let soulUrge: WesternNameMetricResult | null = null;
  let personality: WesternNameMetricResult | null = null;

  if (birthNameText !== null && birthName !== null) {
    expression = westernExpression(birthNameText, birthName.yClassifications);
    addNameFact(builder, profileId, "expression", expression);
    if (!addUnsupportedYWarnings(builder, profileId, birthName)) {
      soulUrge = addOptionalWesternNameFact(builder, profileId, "soul_urge", birthName, () =>
        westernSoulUrge(birthNameText, birthName.yClassifications),
      );
      personality = addOptionalWesternNameFact(builder, profileId, "personality", birthName, () =>
        westernPersonality(birthNameText, birthName.yClassifications),
      );
      if (soulUrge !== null) {
        addNameFact(builder, profileId, "soul_urge", soulUrge);
      }
      if (personality !== null) {
        addNameFact(builder, profileId, "personality", personality);
      }
    }

    const lessons = westernKarmicLessons(birthNameText);
    builder.addFact({
      displayTokens: Object.freeze(lessons.map(String)),
      factId: `${profileId}.karmic_lessons`,
      metadata: deepFreeze({ missingValues: [...lessons] }),
      metricId: "karmic_lessons",
      occurrences: deepFreeze(
        Object.fromEntries(
          [1, 2, 3, 4, 5, 6, 7, 8, 9].map((value) => [
            String(value),
            lessons.includes(value) ? 1 : 0,
          ]),
        ),
      ),
      profileId,
      root: 0,
      traceIds: Object.freeze([
        builder.addTrace(
          profileId,
          "karmic_lessons",
          "map_letters",
          ["birth-name"],
          [...lessons],
          0,
          `${profileId}.karmic_lessons`,
        ),
      ]),
    });

    const passion = westernHiddenPassion(birthNameText);
    builder.addFact({
      displayTokens: Object.freeze(passion.map(String)),
      factId: `${profileId}.hidden_passion`,
      metadata: deepFreeze({ values: [...passion] }),
      metricId: "hidden_passion",
      occurrences: deepFreeze(Object.fromEntries(passion.map((value) => [String(value), 1]))),
      profileId,
      root: 0,
      traceIds: Object.freeze([
        builder.addTrace(
          profileId,
          "hidden_passion",
          "map_letters",
          ["birth-name"],
          [...passion],
          0,
          `${profileId}.hidden_passion`,
        ),
      ]),
    });
  }

  if (expression !== null) {
    addNumberFact(builder, profileId, "maturity", westernMaturity(lifePath, expression));
  }
  if (expression !== null && soulUrge !== null && personality !== null) {
    const bridges = westernBridges(lifePath, expression, soulUrge, personality);
    for (const [metricId, root] of [
      ["bridge_life_path_expression", bridges.lifePathExpression],
      ["bridge_soul_personality", bridges.soulPersonality],
    ] as const) {
      builder.addFact({
        displayTokens: Object.freeze([String(root)]),
        factId: `${profileId}.${metricId}`,
        metricId,
        profileId,
        root,
        traceIds: Object.freeze([
          builder.addTrace(
            profileId,
            metricId,
            "difference",
            [root],
            [],
            root,
            `${profileId}.${metricId}`,
          ),
        ]),
      });
    }
  }

  const targetYear = yearFromAsOfDate(request.asOfDate);
  const personalYear = westernPersonalYear(request.civilDate, targetYear);
  addNumberFact(builder, profileId, "personal_year", personalYear, {
    sunNumber: personalYear.sunNumber,
    targetYear,
    yearDigitSum: personalYear.yearDigitSum,
  });
  for (const personalMonth of westernPersonalMonths(request.civilDate, targetYear)) {
    addNumberFact(
      builder,
      profileId,
      `personal_month.${String(personalMonth.month).padStart(2, "0")}`,
      personalMonth,
      {
        month: personalMonth.month,
        personalYearRoot: personalMonth.personalYearRoot,
        targetYear,
      },
    );
  }
}

function addWesternDigitSumProfile(builder: BundleBuilder, request: CalculationRequest): void {
  addNumberFact(
    builder,
    "western_digit_sum_v1",
    "life_path",
    westernDigitSumLifePath(request.civilDate),
  );
}

function addBalliettProfile(
  builder: BundleBuilder,
  request: CalculationRequest,
  names: readonly NormalizedName[],
): void {
  const profileId = "western_balliett_1908_v1";
  addDateReductionFact(builder, profileId, "birth_date", balliettBirthDate(request.civilDate));
  const birthName = findName(names, BIRTH_NAME_KINDS);
  const birthNameText = calculationTextForName(builder, birthName, profileId, "birth");
  if (birthNameText !== null) {
    addNameFact(builder, profileId, "name", balliettName(birthNameText));
  }
}

function addCheiroProfile(
  builder: BundleBuilder,
  request: CalculationRequest,
  names: readonly NormalizedName[],
): void {
  const profileId = "cheiro_1926_v1";
  const dateMetrics = cheiroDateMetrics(request.civilDate);
  for (const [metricId, result] of Object.entries(dateMetrics) as [
    "birth" | "month" | "year",
    { compound: number; root: number },
  ][]) {
    addNumberFact(
      builder,
      profileId,
      `${metricId}_number`,
      simpleNumberResult(result.compound, `${profileId}.${metricId}_number`),
    );
  }

  const popularName = findName(names, POPULAR_NAME_KINDS);
  const popularNameText = calculationTextForName(builder, popularName, profileId, "popular");
  if (popularNameText !== null) {
    const result = cheiroName(popularNameText);
    const mapTraceId = builder.addTrace(
      profileId,
      "name_number",
      "map_letters",
      ["popular-name"],
      [...result.values],
      result.values.reduce((sum, value) => sum + value, 0),
      `${profileId}.name_number.map`,
    );
    const tokenTraceIds = result.tokenCompounds.map((compound, index) => {
      const reduction = reduceWithPolicy(compound, {
        masters: [],
        policyId: `${profileId}.name_number.token.${index + 1}`,
      });
      return builder.addTrace(
        profileId,
        "name_number",
        "reduce",
        [compound],
        reduction.steps.slice(1),
        result.tokenRoots[index] ?? reduction.output,
        `${profileId}.name_number.token.${index + 1}`,
      );
    });
    const sumTraceId = builder.addTrace(
      profileId,
      "name_number",
      "sum",
      result.tokenRoots,
      [],
      result.total,
      `${profileId}.name_number.sum-token-roots`,
    );
    const finalReduction = reduceWithPolicy(result.total, {
      masters: [],
      policyId: `${profileId}.name_number.final`,
    });
    const traceIds = Object.freeze([
      mapTraceId,
      ...tokenTraceIds,
      sumTraceId,
      builder.addTrace(
        profileId,
        "name_number",
        "reduce",
        [result.total],
        finalReduction.steps.slice(1),
        result.root,
        `${profileId}.name_number.final`,
      ),
    ]);
    builder.addFact({
      compound: result.total,
      displayTokens: displayTokens(result.root, result.total),
      factId: `${profileId}.name_number`,
      metadata: deepFreeze({
        tokenCompounds: [...result.tokenCompounds],
        tokenRoots: [...result.tokenRoots],
      }),
      metricId: "name_number",
      profileId,
      root: result.root,
      traceIds,
    });
  }
}

function addJohariProfile(
  builder: BundleBuilder,
  request: CalculationRequest,
  names: readonly NormalizedName[],
): void {
  const profileId = "indian_johari_1990_v1";
  builder.addWarning({
    code: "JOHARI_PREDAWN_BOUNDARY_EXCLUDED",
    message:
      "Johari sunrise/pre-dawn date-boundary adjustment is excluded in V1 because place/time policy is unavailable.",
    policyId: "indian_johari_1990_v1.predawn-boundary-excluded.v1",
    profileId,
    severity: "info",
  });

  const core = johariCore(request.civilDate);
  for (const [metricId, result] of [
    ["psychic_number", core.psychic],
    ["destiny_number", core.destiny],
  ] as const) {
    addNumberFact(
      builder,
      profileId,
      metricId,
      simpleNumberResult(result.compound, `${profileId}.${metricId}`),
      {
        planet: planetForRoot(result.root),
      },
    );
  }

  const dateParts = parseCivilDate(request.civilDate);
  const projected = johariProjectedYear({
    birthDay: dateParts.day,
    birthMonth: dateParts.month,
    targetYear: yearFromAsOfDate(request.asOfDate),
  });
  addNumberFact(
    builder,
    profileId,
    "projected_year",
    simpleNumberResult(projected.compound, `${profileId}.projected_year`),
    {
      targetYear: yearFromAsOfDate(request.asOfDate),
      weekday: projected.weekday,
      weekdayValue: projected.weekdayValue,
      yearSuffix: projected.yearSuffix,
    },
  );

  const popularName = findName(names, POPULAR_NAME_KINDS);
  const popularNameText = calculationTextForName(builder, popularName, profileId, "popular");
  if (popularNameText !== null) {
    const result = johariNameNumber(popularNameText);
    const reduction = reduceWithPolicy(result.compound, {
      masters: [],
      policyId: `${profileId}.name_number.final`,
    });
    const traceIds = Object.freeze([
      builder.addTrace(
        profileId,
        "name_number",
        "map_letters",
        ["popular-name"],
        [...result.values],
        result.compound,
        `${profileId}.name_number.map`,
      ),
      builder.addTrace(
        profileId,
        "name_number",
        "reduce",
        [result.compound],
        reduction.steps.slice(1),
        result.root,
        `${profileId}.name_number.final`,
      ),
    ]);
    builder.addFact({
      compound: result.compound,
      displayTokens: displayTokens(result.root, result.compound),
      factId: `${profileId}.name_number`,
      metadata: deepFreeze({ planet: planetForRoot(result.root), values: [...result.values] }),
      metricId: "name_number",
      profileId,
      root: result.root,
      traceIds,
    });
  }
}

function addLoShuFact(
  builder: BundleBuilder,
  profileId: "loshu_raw_dob_v1" | "loshu_indian_augmented_v1",
  date: string,
): void {
  const grid = profileId === "loshu_raw_dob_v1" ? loShuRawGrid(date) : loShuAugmentedGrid(date);
  const occurrences = deepFreeze(
    Object.fromEntries(Object.entries(grid.counts)) as Record<string, number>,
  );
  const traceId = builder.addTrace(
    profileId,
    "grid",
    "count_digits",
    [date],
    grid.occurrences.map((occurrence) => occurrence.digit),
    grid.occurrences.length,
    `${profileId}.grid.counts`,
  );
  builder.addFact({
    displayTokens: Object.freeze(
      Object.entries(grid.counts).map(([digit, count]) => `${digit}x${count}`),
    ),
    factId: `${profileId}.grid`,
    metadata: deepFreeze({
      ...(grid.augmentationEvents === undefined
        ? {}
        : { augmentationEvents: grid.augmentationEvents }),
      ignoredZeros: grid.ignoredZeros,
      lines: grid.lines,
      occurrences: grid.occurrences,
    }),
    metricId: "grid",
    occurrences,
    profileId,
    root: 0,
    traceIds: Object.freeze([traceId]),
  });
}

function assertRequest(request: CalculationRequest): void {
  if (!isRecord(request)) {
    throw new RangeError("Calculation request must be an object.");
  }
  if (request.schemaVersion !== "1.0.0") {
    throw new RangeError("Calculation request schemaVersion must be 1.0.0.");
  }
  if (typeof request.civilDate !== "string" || typeof request.asOfDate !== "string") {
    throw new RangeError("Calculation request dates must be strings.");
  }
  const civilDate = parseCivilDate(request.civilDate);
  const asOfDate = parseCivilDate(request.asOfDate);
  if (
    civilDate.year > asOfDate.year ||
    (civilDate.year === asOfDate.year &&
      (civilDate.month > asOfDate.month ||
        (civilDate.month === asOfDate.month && civilDate.day > asOfDate.day)))
  ) {
    throw new RangeError("Civil date cannot be after the as-of date.");
  }
  let age = asOfDate.year - civilDate.year;
  if (
    asOfDate.month < civilDate.month ||
    (asOfDate.month === civilDate.month && asOfDate.day < civilDate.day)
  ) {
    age -= 1;
  }
  if (age < 18) {
    throw new RangeError("Calculation requests require an adult subject.");
  }
  if (!Array.isArray(request.names)) {
    throw new RangeError("Calculation request names must be an array.");
  }
  if (!Array.isArray(request.profiles) || request.profiles.length === 0) {
    throw new RangeError("At least one profile is required.");
  }
  const selected = new Set<string>();
  for (const profileId of request.profiles) {
    if (typeof profileId !== "string" || !PROFILE_ID_SET.has(profileId)) {
      throw new RangeError(`Unsupported profile: ${String(profileId)}.`);
    }
    if (selected.has(profileId)) {
      throw new RangeError(`Duplicate profile: ${profileId}.`);
    }
    selected.add(profileId);
  }
}

export function calculateBundle(request: CalculationRequest): CalculationBundle {
  assertRequest(request);
  const names = normalizeNames(request);
  const builder = new BundleBuilder();

  for (const profileId of request.profiles) {
    switch (profileId) {
      case "western_decoz_v1":
        addWesternProfile(builder, request, names);
        break;
      case "western_digit_sum_v1":
        addWesternDigitSumProfile(builder, request);
        break;
      case "western_balliett_1908_v1":
        addBalliettProfile(builder, request, names);
        break;
      case "cheiro_1926_v1":
        addCheiroProfile(builder, request, names);
        break;
      case "indian_johari_1990_v1":
        addJohariProfile(builder, request, names);
        break;
      case "loshu_raw_dob_v1":
        addLoShuFact(builder, profileId, request.civilDate);
        break;
      case "loshu_indian_augmented_v1":
        addLoShuFact(builder, profileId, request.civilDate);
        break;
    }
  }

  return deepFreeze({
    engineVersion: ENGINE_VERSION,
    facts: builder.facts,
    formulaManifestHash: FORMULA_MANIFEST_HASH,
    inputHash: canonicalHash(request),
    traces: builder.traces,
    warnings: builder.warnings,
  });
}

export function validateBundle(bundle: unknown): BundleValidationResult {
  const diagnostics: string[] = [];
  if (!isRecord(bundle)) {
    return { diagnostics: Object.freeze(["bundle must be an object"]), valid: false };
  }

  if (bundle.engineVersion !== ENGINE_VERSION) {
    diagnostics.push("engineVersion mismatch");
  }
  if (!isSha256Hash(bundle.formulaManifestHash)) {
    diagnostics.push("formulaManifestHash must be a sha256 hash");
  } else if (bundle.formulaManifestHash !== FORMULA_MANIFEST_HASH) {
    diagnostics.push("formulaManifestHash mismatch");
  }
  if (!isSha256Hash(bundle.inputHash)) {
    diagnostics.push("inputHash must be a sha256 hash");
  }
  if (!Array.isArray(bundle.traces)) {
    diagnostics.push("traces must be an array");
  }
  if (!Array.isArray(bundle.facts)) {
    diagnostics.push("facts must be an array");
  }
  if (!Array.isArray(bundle.warnings)) {
    diagnostics.push("warnings must be an array");
  }
  if (
    diagnostics.length > 0 &&
    (!Array.isArray(bundle.traces) ||
      !Array.isArray(bundle.facts) ||
      !Array.isArray(bundle.warnings))
  ) {
    return { diagnostics: Object.freeze(diagnostics), valid: false };
  }

  const traceIds = new Set<string>();
  for (const [index, rawTrace] of (bundle.traces as readonly unknown[]).entries()) {
    if (!isRecord(rawTrace)) {
      diagnostics.push(`trace[${index}] must be an object`);
      continue;
    }
    if (typeof rawTrace.traceId !== "string" || rawTrace.traceId.length === 0) {
      diagnostics.push(`trace[${index}] has an invalid traceId`);
      continue;
    }
    if (traceIds.has(rawTrace.traceId)) {
      diagnostics.push(`duplicate trace: ${rawTrace.traceId}`);
    }
    traceIds.add(rawTrace.traceId);
    if (!TRACE_OPERATIONS.has(rawTrace.operation as NumericTrace["operation"])) {
      diagnostics.push(`trace[${index}] has an invalid operation`);
    }
    if (!Array.isArray(rawTrace.inputs) || !Array.isArray(rawTrace.intermediates)) {
      diagnostics.push(`trace[${index}] inputs/intermediates must be arrays`);
    } else {
      if (!rawTrace.inputs.every(isTraceInput)) {
        diagnostics.push(`trace[${index}] inputs must be numbers or strings`);
      }
      if (!rawTrace.intermediates.every(isNonNegativeSafeInteger)) {
        diagnostics.push(`trace[${index}] intermediates must be non-negative integers`);
      }
    }
    if (typeof rawTrace.policyId !== "string" || rawTrace.policyId.length === 0) {
      diagnostics.push(`trace[${index}] has an invalid policyId`);
    }
    if (!isNonNegativeSafeInteger(rawTrace.output)) {
      diagnostics.push(`trace[${index}] has an invalid output`);
    }
  }

  const factIds = new Set<string>();
  for (const [index, rawFact] of (bundle.facts as readonly unknown[]).entries()) {
    if (!isRecord(rawFact)) {
      diagnostics.push(`fact[${index}] must be an object`);
      continue;
    }
    if (typeof rawFact.factId !== "string" || rawFact.factId.length === 0) {
      diagnostics.push(`fact[${index}] has an invalid factId`);
    } else {
      if (factIds.has(rawFact.factId)) {
        diagnostics.push(`duplicate fact: ${rawFact.factId}`);
      }
      factIds.add(rawFact.factId);
    }
    if (typeof rawFact.metricId !== "string" || rawFact.metricId.length === 0) {
      diagnostics.push(`fact[${index}] has an invalid metricId`);
    }
    if (typeof rawFact.profileId !== "string" || !PROFILE_ID_SET.has(rawFact.profileId)) {
      diagnostics.push(`unsupported profile: ${String(rawFact.profileId)}`);
    }
    if (!isNonNegativeSafeInteger(rawFact.root)) {
      diagnostics.push(`fact[${index}] has an invalid root`);
    }
    if (!Array.isArray(rawFact.displayTokens)) {
      diagnostics.push(`fact[${index}] displayTokens must be an array`);
    } else if (!rawFact.displayTokens.every((token) => typeof token === "string")) {
      diagnostics.push(`fact[${index}] displayTokens must contain strings`);
    }
    if (rawFact.compound !== undefined && !isNonNegativeSafeInteger(rawFact.compound)) {
      diagnostics.push(`fact[${index}] has an invalid compound`);
    }
    if (
      rawFact.master !== undefined &&
      rawFact.master !== 11 &&
      rawFact.master !== 22 &&
      rawFact.master !== 33
    ) {
      diagnostics.push(`fact[${index}] has an invalid master`);
    }
    if (!Array.isArray(rawFact.traceIds)) {
      diagnostics.push(`fact[${index}] traceIds must be an array`);
      continue;
    }
    for (const traceId of rawFact.traceIds) {
      if (typeof traceId !== "string" || !traceIds.has(traceId)) {
        diagnostics.push(`missing trace: ${String(traceId)}`);
      }
    }
  }

  const warningIds = new Set<string>();
  for (const [index, rawWarning] of (bundle.warnings as readonly unknown[]).entries()) {
    if (!isRecord(rawWarning)) {
      diagnostics.push(`warning[${index}] must be an object`);
      continue;
    }
    if (typeof rawWarning.warningId !== "string" || rawWarning.warningId.length === 0) {
      diagnostics.push(`warning[${index}] has an invalid warningId`);
    } else if (warningIds.has(rawWarning.warningId)) {
      diagnostics.push(`duplicate warning: ${rawWarning.warningId}`);
    } else {
      warningIds.add(rawWarning.warningId);
    }
    if (
      typeof rawWarning.code !== "string" ||
      !WARNING_CODES.has(rawWarning.code as EngineWarning["code"])
    ) {
      diagnostics.push(`warning[${index}] has an invalid code`);
    }
    if (typeof rawWarning.message !== "string" || rawWarning.message.length === 0) {
      diagnostics.push(`warning[${index}] has an invalid message`);
    }
    if (typeof rawWarning.policyId !== "string" || rawWarning.policyId.length === 0) {
      diagnostics.push(`warning[${index}] has an invalid policyId`);
    }
    if (rawWarning.severity !== "info" && rawWarning.severity !== "warning") {
      diagnostics.push(`warning[${index}] has an invalid severity`);
    }
    if (
      rawWarning.profileId !== undefined &&
      (typeof rawWarning.profileId !== "string" || !PROFILE_ID_SET.has(rawWarning.profileId))
    ) {
      diagnostics.push(`warning[${index}] has an unsupported profile`);
    }
  }

  return { diagnostics: Object.freeze(diagnostics), valid: diagnostics.length === 0 };
}
