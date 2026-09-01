import { describe, expect, it } from "vitest";
import { BundleBuilder } from "./bundle-builder";
import {
  addOptionalWesternNameFact,
  addUnsupportedYWarnings,
  calculationTextForName,
} from "./bundle-input";
import { normalizeName, type NormalizedName } from "./identity";

describe("bundle input assembly", () => {
  it("distinguishes absent, unsupported, and empty calculation text", () => {
    const builder = new BundleBuilder();
    expect(calculationTextForName(builder, null, "western_decoz_v1", "birth")).toBeNull();
    expect(builder.warnings[0]?.code).toBe("MISSING_NAME_USE");

    const unsupported = normalizeName({ id: "birth", kind: "birth_full", value: "Aé" });
    expect(calculationTextForName(builder, unsupported, "western_decoz_v1", "birth")).toBeNull();
    expect(builder.warnings[1]?.code).toBe("UNSUPPORTED_NAME_CHARACTER");

    const noText: NormalizedName = {
      calculationText: null,
      id: "birth",
      kind: "birth_full",
      nfc: "श्रेया",
      script: "Latn",
      yClassifications: {},
    };
    expect(calculationTextForName(builder, noText, "western_decoz_v1", "birth")).toBeNull();
  });

  it("reports Y ambiguity and does not swallow unexpected optional-metric errors", () => {
    const builder = new BundleBuilder();
    const clear = normalizeName({ id: "birth", kind: "birth_full", value: "ANNA" });
    const ambiguous = normalizeName({ id: "birth", kind: "birth_full", value: "LYDIA" });

    expect(addUnsupportedYWarnings(builder, "western_decoz_v1", clear)).toBe(false);
    expect(addUnsupportedYWarnings(builder, "western_decoz_v1", ambiguous)).toBe(true);
    expect(() =>
      addOptionalWesternNameFact(builder, "western_decoz_v1", "soul_urge", clear, () => {
        throw new Error("unexpected calculation failure");
      }),
    ).toThrow("unexpected calculation failure");
  });
});
