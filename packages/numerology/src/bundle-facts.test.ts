import { describe, expect, it } from "vitest";
import { BundleBuilder } from "./bundle-builder";
import {
  addDateReductionFact,
  addNameFact,
  addNumberFact,
  displayTokens,
  traceReduction,
} from "./bundle-facts";
import { reduceWithPolicy } from "./reduction";
import { westernExpression, westernLifePath } from "./western";

describe("bundle fact assembly", () => {
  it("retains optional display tokens, reduction policy labels, and metadata", () => {
    expect(displayTokens(4)).toEqual(["4"]);
    expect(displayTokens(4, 13)).toEqual(["13", "4"]);
    expect(displayTokens(22, 22, 22)).toEqual(["22"]);

    const builder = new BundleBuilder();
    const masterReduction = reduceWithPolicy(22, { masters: [11, 22, 33], policyId: "master" });
    const debtReduction = reduceWithPolicy(49, { masters: [], policyId: "debt" });
    const traceIds = traceReduction(builder, "western_decoz_v1", "sample", {
      compound: 22,
      finalReduction: masterReduction,
      root: 22,
    });
    addNumberFact(
      builder,
      "western_decoz_v1",
      "sample",
      {
        compound: 49,
        finalReduction: debtReduction,
        karmicDebts: [13],
        preservedMaster: null,
        root: 4,
      },
      { source: "test" },
    );

    expect(traceIds).toHaveLength(1);
    expect(builder.facts[0]).toMatchObject({
      compound: 49,
      karmicDebts: [13],
      metadata: { source: "test" },
    });
    expect(builder.traces[0]?.policyId).toBe("western_decoz_v1.sample.reduce.master");
  });

  it("assembles a date fact with a preserved master", () => {
    const builder = new BundleBuilder();
    addDateReductionFact(builder, "western_decoz_v1", "life_path", westernLifePath("1940-09-26"));

    expect(builder.facts[0]).toMatchObject({ compound: 22, master: 22, root: 22 });
    expect(builder.traces).toHaveLength(5);
  });

  it("assembles name traces with token reductions and final reductions", () => {
    const builder = new BundleBuilder();
    addNameFact(builder, "western_decoz_v1", "expression", westernExpression("ZZZZZZA"));

    expect(builder.facts[0]).toMatchObject({ compound: 4, karmicDebts: [13] });
    expect(builder.traces.map((trace) => trace.operation)).toEqual(["reduce", "sum", "reduce"]);
  });
});
