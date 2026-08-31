import { calculateBundle } from "./bundle";
import { stableStringify } from "./stable-json";
import type { CalculationBundle, CalculationRequest } from "./types";

export interface EngineFixture {
  readonly description: string;
  readonly expected: Readonly<Record<string, unknown>>;
  readonly request: CalculationRequest;
}

export interface FixtureCalculation {
  readonly bundle: CalculationBundle;
  readonly expected: Readonly<Record<string, unknown>>;
  readonly fixtureId: string;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return value;
}

const FIXTURES: Readonly<Record<string, EngineFixture>> = deepFreeze({
  "D-MAP-001": {
    description: "Cheiro/Johari mapping divergence minimal counterexample.",
    expected: {
      cheiro: { values: [3, 5, 5], compound: 13, root: 4 },
      johari: { values: [2, 8, 6], compound: 16, root: 7 },
    },
    request: {
      asOfDate: "2026-08-31",
      civilDate: "1990-08-12",
      names: [{ id: "popular", kind: "popular", value: "CHX" }],
      profiles: ["cheiro_1926_v1", "indian_johari_1990_v1"],
      schemaVersion: "1.0.0",
    },
  },
  "D-MAP-CHEIRO-JOHARI-CHX": {
    description: "C/H/X mapping divergence across Cheiro and Johari alphabets.",
    expected: { cheiro: "13/4", johari: "16/7" },
    request: {
      asOfDate: "2026-08-31",
      civilDate: "1990-08-12",
      names: [{ id: "popular", kind: "popular", value: "CHX" }],
      profiles: ["cheiro_1926_v1", "indian_johari_1990_v1"],
      schemaVersion: "1.0.0",
    },
  },
  "G-B-DOB-001": {
    description: "Balliett birth-date source example.",
    expected: { compound: 18, root: 9 },
    request: {
      asOfDate: "2026-08-31",
      civilDate: "1872-01-17",
      names: [{ id: "birth", kind: "birth_full", value: "HENRY ELDER" }],
      profiles: ["western_balliett_1908_v1"],
      schemaVersion: "1.0.0",
    },
  },
  "G-B-NAME-001": {
    description: "Balliett name source example.",
    expected: { compound: 15, root: 6 },
    request: {
      asOfDate: "2026-08-31",
      civilDate: "1872-01-17",
      names: [{ id: "birth", kind: "birth_full", value: "HENRY ELDER" }],
      profiles: ["western_balliett_1908_v1"],
      schemaVersion: "1.0.0",
    },
  },
  "G-C-DATE-001": {
    description: "Cheiro's separate birth, month, and year values.",
    expected: { birth: "6/6", month: "6/6", year: "21/3" },
    request: {
      asOfDate: "2026-08-31",
      civilDate: "1866-06-06",
      names: [],
      profiles: ["cheiro_1926_v1"],
      schemaVersion: "1.0.0",
    },
  },
  "G-C-NAME-001": {
    description: "Cheiro Lloyd George token-reduced name example.",
    expected: { compound: 16, root: 7, tokenCompounds: [18, 25] },
    request: {
      asOfDate: "2026-08-31",
      civilDate: "1866-06-06",
      names: [{ id: "popular", kind: "popular", value: "LLOYD GEORGE" }],
      profiles: ["cheiro_1926_v1"],
      schemaVersion: "1.0.0",
    },
  },
  "G-J-CORE-001": {
    description: "Johari Psychic and Destiny date example.",
    expected: { destiny: 7, destinyCompound: 25, psychic: 3 },
    request: {
      asOfDate: "2026-08-31",
      civilDate: "1934-05-12",
      names: [{ id: "popular", kind: "popular", value: "CHX" }],
      profiles: ["indian_johari_1990_v1"],
      schemaVersion: "1.0.0",
    },
  },
  "G-J-DOB-001": {
    description: "Johari Psychic and Destiny date example.",
    expected: { destiny: 7, destinyCompound: 25, psychic: 3 },
    request: {
      asOfDate: "2026-08-31",
      civilDate: "1934-05-12",
      names: [{ id: "popular", kind: "popular", value: "CHX" }],
      profiles: ["indian_johari_1990_v1"],
      schemaVersion: "1.0.0",
    },
  },
  "G-J-YEAR-001": {
    description: "Johari projected year birthday-weekday example.",
    expected: { compound: 109, root: 1, weekday: "Sunday", weekdayValue: 1 },
    request: {
      asOfDate: "1991-01-01",
      civilDate: "1934-05-12",
      names: [],
      profiles: ["indian_johari_1990_v1"],
      schemaVersion: "1.0.0",
    },
  },
  "G-LS-001": {
    description: "Lo Shu raw DOB grid with zeros ignored.",
    expected: { counts: { 1: 2, 2: 1, 8: 1, 9: 2 }, ignoredZeros: 2 },
    request: {
      asOfDate: "2026-08-31",
      civilDate: "1990-08-12",
      names: [],
      profiles: ["loshu_raw_dob_v1"],
      schemaVersion: "1.0.0",
    },
  },
  "G-LS-RAW-001": {
    description: "Lo Shu raw DOB grid with zeros ignored.",
    expected: { counts: { 1: 2, 2: 1, 8: 1, 9: 2 }, ignoredZeros: 2 },
    request: {
      asOfDate: "2026-08-31",
      civilDate: "1990-08-12",
      names: [],
      profiles: ["loshu_raw_dob_v1"],
      schemaVersion: "1.0.0",
    },
  },
  "G-W-EXP-001": {
    description: "Decoz Expression worked example.",
    expected: { compound: 31, root: 4, tokenCompounds: [22, 30, 42] },
    request: {
      asOfDate: "2026-08-31",
      civilDate: "1990-08-12",
      names: [{ id: "birth", kind: "birth_full", value: "THOMAS CRUISE MAPOTHER" }],
      profiles: ["western_decoz_v1"],
      schemaVersion: "1.0.0",
    },
  },
  "G-W-SU-001": {
    description: "Decoz Soul Urge worked example.",
    expected: { compound: 20, root: 2, tokenCompounds: [7, 6, 7] },
    request: {
      asOfDate: "2026-08-31",
      civilDate: "1990-08-12",
      names: [{ id: "birth", kind: "birth_full", value: "THOMAS JOHN HANCOCK" }],
      profiles: ["western_decoz_v1"],
      schemaVersion: "1.0.0",
    },
  },
  "G-W-LP-001": {
    description: "Decoz Life Path worked example.",
    expected: { componentOutputs: [8, 3, 1], compound: 12, root: 3 },
    request: {
      asOfDate: "2026-08-31",
      civilDate: "1990-08-12",
      names: [{ id: "birth", kind: "birth_full", value: "THOMAS CRUISE MAPOTHER" }],
      profiles: ["western_decoz_v1"],
      schemaVersion: "1.0.0",
    },
  },
});

export function listFixtures(): readonly string[] {
  return Object.freeze(Object.keys(FIXTURES).sort());
}

export function calculateFixture(fixtureId: string): FixtureCalculation {
  const fixture = FIXTURES[fixtureId];
  if (fixture === undefined) {
    throw new RangeError(`Unknown fixture: ${fixtureId}.`);
  }
  return Object.freeze({
    bundle: calculateBundle(fixture.request),
    expected: fixture.expected,
    fixtureId,
  });
}

export function runEngineCli(args: readonly string[]): string {
  if (args[0] === "list-fixtures") {
    return `${stableStringify({ fixtures: listFixtures() })}\n`;
  }
  if (args[0] !== "calculate") {
    throw new RangeError("Unsupported command. Use calculate --fixture <id> or list-fixtures.");
  }

  const fixtureFlagIndex = args.indexOf("--fixture");
  const fixtureId = fixtureFlagIndex >= 0 ? args[fixtureFlagIndex + 1] : undefined;
  if (fixtureId === undefined) {
    throw new RangeError("calculate requires --fixture <id>.");
  }

  return `${stableStringify(calculateFixture(fixtureId))}\n`;
}
