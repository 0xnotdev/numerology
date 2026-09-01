import { deepFreeze } from "@numerology/shared";
import type { BundleBuilder } from "./bundle-builder";
import {
  addDateReductionFact,
  addNameFact,
  addNumberFact,
  displayTokens,
  simpleNumberResult,
} from "./bundle-facts";
import {
  addOptionalWesternNameFact,
  addUnsupportedYWarnings,
  BIRTH_NAME_KINDS,
  calculationTextForName,
  findName,
  POPULAR_NAME_KINDS,
} from "./bundle-input";
import { cheiroDateMetrics, cheiroName } from "./cheiro";
import { parseCivilDate, yearFromAsOfDate } from "./date";
import type { NormalizedName } from "./identity";
import { johariCore, johariNameNumber, johariProjectedYear, planetForRoot } from "./johari";
import { reduceWithPolicy } from "./reduction";
import type { CalculationRequest } from "./types";
import {
  balliettBirthDate,
  balliettName,
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
  type WesternNameMetricResult,
} from "./western";

export function addWesternProfile(
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

export function addWesternDigitSumProfile(
  builder: BundleBuilder,
  request: CalculationRequest,
): void {
  addNumberFact(
    builder,
    "western_digit_sum_v1",
    "life_path",
    westernDigitSumLifePath(request.civilDate),
  );
}

export function addBalliettProfile(
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

export function addCheiroProfile(
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

export function addJohariProfile(
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
