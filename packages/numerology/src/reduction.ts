import { sumDigits } from "./date";
import type { MasterNumber } from "./types";

export interface ReductionTrace {
  readonly input: number;
  readonly steps: readonly number[];
  readonly value: number;
}

export interface ReductionPolicy {
  readonly masters: readonly MasterNumber[];
  readonly policyId: string;
}

export interface PolicyReductionTrace {
  readonly compound: number;
  readonly output: number;
  readonly preservedMaster: MasterNumber | null;
  readonly steps: readonly number[];
}

export interface ComponentReductionResult {
  readonly componentOutputs: readonly number[];
  readonly componentReductions: readonly PolicyReductionTrace[];
  readonly compound: number;
  readonly finalReduction: PolicyReductionTrace;
  readonly root: number;
}

function assertNonNegativeSafeInteger(input: number, functionName: string): void {
  if (!Number.isSafeInteger(input) || input < 0) {
    throw new RangeError(`${functionName} expects a non-negative safe integer`);
  }
}

function assertReductionPolicy(policy: ReductionPolicy): void {
  if (
    policy === null ||
    typeof policy !== "object" ||
    typeof policy.policyId !== "string" ||
    policy.policyId.trim().length === 0 ||
    !Array.isArray(policy.masters)
  ) {
    throw new RangeError("Reduction policy is invalid.");
  }
  const seen = new Set<number>();
  for (const master of policy.masters) {
    if (master !== 11 && master !== 22 && master !== 33) {
      throw new RangeError("Reduction policy contains an invalid master number.");
    }
    if (seen.has(master)) {
      throw new RangeError("Reduction policy repeats a master number.");
    }
    seen.add(master);
  }
}

/**
 * Reduces a non-negative integer to one digit and records every sum.
 *
 * This primitive intentionally has no master-number policy. Profile-aware
 * reducers compose it rather than smuggling doctrine into shared arithmetic.
 */
export function digitalRoot(input: number): ReductionTrace {
  assertNonNegativeSafeInteger(input, "digitalRoot");

  const steps: number[] = [input];
  let value = input;

  while (value >= 10) {
    value = sumDigits(value);
    steps.push(value);
  }

  return Object.freeze({ input, steps: Object.freeze(steps), value });
}

export function reduceDigits(input: number): ReductionTrace {
  return digitalRoot(input);
}

export function reduceComponents(
  components: readonly number[],
  policy: ReductionPolicy,
): ComponentReductionResult {
  if (!Array.isArray(components) || components.length === 0) {
    throw new RangeError("reduceComponents expects at least one component.");
  }
  const componentReductions = components.map((component) => reduceWithPolicy(component, policy));
  const componentOutputs = componentReductions.map((component) => component.output);
  const compound = componentOutputs.reduce((sum, component) => sum + component, 0);
  const finalReduction = reduceWithPolicy(compound, policy);
  return Object.freeze({
    componentOutputs: Object.freeze(componentOutputs),
    componentReductions: Object.freeze(componentReductions),
    compound,
    finalReduction,
    root: finalReduction.output,
  });
}

export function reduceWithPolicy(input: number, policy: ReductionPolicy): PolicyReductionTrace {
  assertNonNegativeSafeInteger(input, "reduceWithPolicy");
  assertReductionPolicy(policy);
  const masters = new Set(policy.masters);
  const steps: number[] = [input];
  let value = input;

  while (value >= 10 && !masters.has(value as MasterNumber)) {
    value = sumDigits(value);
    steps.push(value);
  }

  const preservedMaster = masters.has(value as MasterNumber) ? (value as MasterNumber) : null;
  return Object.freeze({
    compound: input,
    output: value,
    preservedMaster,
    steps: Object.freeze(steps),
  });
}
