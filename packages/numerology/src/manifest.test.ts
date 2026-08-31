import { describe, expect, it } from "vitest";
import {
  FORMULA_MANIFEST_HASH,
  PROFILE_MANIFESTS,
  canonicalHash,
  compileFormulaManifest,
  stableStringify,
} from "./index";

const COMPLETE_MAPPING = {
  1: "AJS",
  2: "BKT",
  3: "CLU",
  4: "DMV",
  5: "ENW",
  6: "FOX",
  7: "GPY",
  8: "HQZ",
  9: "IR",
};

describe("formula manifest", () => {
  it("hashes the immutable Checkpoint 2 profile release", () => {
    expect(FORMULA_MANIFEST_HASH).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(Object.isFrozen(PROFILE_MANIFESTS)).toBe(true);
    expect(PROFILE_MANIFESTS.western_decoz_v1.metrics.life_path).toMatchObject({
      formula: "component_reduce_then_sum",
      masters: [11, 22, 33],
    });
  });

  it("rejects incomplete or overlapping alphabet manifests", () => {
    expect(() =>
      compileFormulaManifest({
        profiles: {},
        mappings: {
          broken: {
            1: "AB",
            2: "B",
            3: "",
            4: "",
            5: "",
            6: "",
            7: "",
            8: "",
            9: "",
          },
        },
      }),
    ).toThrow(/overlap/u);
  });

  it("uses canonical object-key ordering and NFC strings for content hashes", () => {
    expect(canonicalHash({ b: 2, a: 1 })).toBe(canonicalHash({ a: 1, b: 2 }));
    expect(stableStringify("Jose\u0301")).toBe('"José"');
    expect(canonicalHash("Jose\u0301")).toBe(canonicalHash("José"));
    expect(canonicalHash({ "e\u0301": 1 })).toBe(canonicalHash({ é: 1 }));
  });

  it("rejects a manifest with no profiles", () => {
    expect(() =>
      compileFormulaManifest({ mappings: { western: COMPLETE_MAPPING }, profiles: {} }),
    ).toThrow(/profile/u);
  });

  it("rejects profiles that reference unknown mappings or invalid master numbers", () => {
    expect(() =>
      compileFormulaManifest({
        mappings: { western: COMPLETE_MAPPING },
        profiles: {
          broken: {
            alphabet: "missing",
            metrics: {
              life_path: {
                formula: "component_reduce_then_sum",
                masters: [11, 12] as never,
                source: "test",
              },
            },
            profileId: "broken",
            tradition: "test",
          },
        },
      }),
    ).toThrow(/unknown mapping|master/u);
  });

  it("does not freeze or mutate the manifest input while compiling", () => {
    const input = {
      mappings: { western: { ...COMPLETE_MAPPING } },
      profiles: {
        western: {
          alphabet: "western",
          metrics: {
            sample: { formula: "sample", masters: [], source: "test" },
          },
          profileId: "western",
          tradition: "test",
        },
      },
    };

    compileFormulaManifest(input);

    expect(Object.isFrozen(input)).toBe(false);
    expect(Object.isFrozen(input.mappings)).toBe(false);
    expect(Object.isFrozen(input.mappings.western)).toBe(false);
  });
});
