export interface ReductionTrace {
  readonly input: number;
  readonly steps: readonly number[];
  readonly value: number;
}

/**
 * Reduces a non-negative integer to one digit and records every sum.
 *
 * This primitive intentionally has no master-number policy. A profile-aware
 * reducer will compose it in Checkpoint 2 rather than smuggling doctrine into
 * shared arithmetic.
 */
export function digitalRoot(input: number): ReductionTrace {
  if (!Number.isSafeInteger(input) || input < 0) {
    throw new RangeError("digitalRoot expects a non-negative safe integer");
  }

  const steps: number[] = [input];
  let value = input;

  while (value >= 10) {
    value = String(value)
      .split("")
      .reduce((sum, digit) => sum + Number(digit), 0);
    steps.push(value);
  }

  return Object.freeze({ input, steps: Object.freeze(steps), value });
}
