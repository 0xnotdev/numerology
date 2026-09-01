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

  it.each(listFixtures())("matches the complete golden bundle for %s", (fixtureId) => {
    const calculation = calculateFixture(fixtureId);

    expect(Object.isFrozen(calculation.expected), `${fixtureId}: expected fixture is frozen`).toBe(
      true,
    );
    expect(calculation.bundle, `${fixtureId}: calculated bundle drift`).toEqual(
      calculation.expected,
    );
    expect(calculation.bundle.traces, `${fixtureId}: complete trace drift`).toEqual(
      calculation.expected.traces,
    );
  });

  it("prints canonical JSON for pnpm engine calculate --fixture", () => {
    const output = runEngineCli(["calculate", "--fixture", "G-C-NAME-001"]);
    const parsed = JSON.parse(output);
    const expected = calculateFixture("G-C-NAME-001");

    expect(parsed.fixtureId).toBe("G-C-NAME-001");
    expect(parsed.bundle).toEqual(expected.expected);
    expect(parsed.bundle.traces).toEqual(expected.expected.traces);
    expect(parsed.expected).toEqual(expected.expected);
  });

  it("rejects unknown fixtures and unsupported commands", () => {
    expect(() => calculateFixture("unknown")).toThrow(RangeError);
    expect(() => runEngineCli(["unknown"])).toThrow(RangeError);
  });
});
