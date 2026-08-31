import { describe, expect, it } from "vitest";
import { calculateFixture, listFixtures, runEngineCli } from "./index";

describe("engine fixture CLI", () => {
  it("lists the canonical handbook and divergence fixture IDs", () => {
    expect(listFixtures()).toEqual([
      "D-MAP-001",
      "D-MAP-CHEIRO-JOHARI-CHX",
      "G-B-DOB-001",
      "G-B-NAME-001",
      "G-C-DATE-001",
      "G-C-NAME-001",
      "G-J-CORE-001",
      "G-J-DOB-001",
      "G-J-YEAR-001",
      "G-LS-001",
      "G-LS-RAW-001",
      "G-W-EXP-001",
      "G-W-LP-001",
      "G-W-SU-001",
    ]);
  });

  it("calculates handbook fixtures as canonical JSON objects", () => {
    const lifePath = calculateFixture("G-W-LP-001");

    expect(lifePath.fixtureId).toBe("G-W-LP-001");
    expect(Object.isFrozen(lifePath.expected)).toBe(true);
    expect(lifePath.bundle.facts).toContainEqual(
      expect.objectContaining({
        factId: "western_decoz_v1.life_path",
        metricId: "life_path",
        root: 3,
      }),
    );
  });

  it("prints canonical JSON for pnpm engine calculate --fixture", () => {
    const output = runEngineCli(["calculate", "--fixture", "G-C-NAME-001"]);
    const parsed = JSON.parse(output);

    expect(parsed.fixtureId).toBe("G-C-NAME-001");
    expect(parsed.bundle.facts).toContainEqual(
      expect.objectContaining({
        factId: "cheiro_1926_v1.name_number",
        metricId: "name_number",
        root: 7,
      }),
    );
  });

  it("rejects unknown fixtures and unsupported commands", () => {
    expect(() => calculateFixture("unknown")).toThrow(RangeError);
    expect(() => runEngineCli(["unknown"])).toThrow(RangeError);
  });
});
