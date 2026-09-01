import { deepFreeze } from "./deep-freeze";
import type { CalculatedFact, EngineWarning, NumericTrace, ProfileId } from "./types";

export class BundleBuilder {
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
