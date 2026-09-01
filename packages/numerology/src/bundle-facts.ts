import { deepFreeze } from "@numerology/shared";
import { loShuAugmentedGrid, loShuRawGrid } from "./lo-shu";
import { reduceWithPolicy } from "./reduction";
import type { ProfileId } from "./types";
import type { DateReductionResult, SimpleNumberResult, WesternNameMetricResult } from "./western";
import type { BundleBuilder } from "./bundle-builder";

export function displayTokens(
  root: number,
  compound?: number,
  master?: 11 | 22 | 33,
): readonly string[] {
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

export function traceReduction(
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

export function addNumberFact(
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

export function simpleNumberResult(compound: number, policyId: string): SimpleNumberResult {
  const finalReduction = reduceWithPolicy(compound, { masters: [], policyId });
  return {
    compound,
    finalReduction,
    karmicDebts: [],
    preservedMaster: null,
    root: finalReduction.output,
  };
}

export function addDateReductionFact(
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

export function addNameFact(
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

export function addLoShuFact(
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
