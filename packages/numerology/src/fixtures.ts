import { deepFreeze } from "@numerology/shared";
import { calculateBundle, parseCalculationBundle } from "./bundle";
import { stableStringify } from "./stable-json";
import { FIXTURE_EXPECTED } from "./fixtures.expected";
import type { CalculationBundle, CalculationRequest } from "./types";

export interface EngineFixture {
  readonly description: string;
  readonly expected: CalculationBundle;
  readonly request: CalculationRequest;
}

export interface FixtureCalculation {
  readonly bundle: CalculationBundle;
  readonly expected: CalculationBundle;
  readonly fixtureId: string;
}

const FIXTURE_REQUESTS: Readonly<Record<string, Omit<EngineFixture, "expected">>> = {
  "D-MAP-001": {
    description: "Cheiro/Johari mapping divergence minimal counterexample.",
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
    request: {
      asOfDate: "2026-08-31",
      civilDate: "1990-08-12",
      names: [{ id: "birth", kind: "birth_full", value: "THOMAS CRUISE MAPOTHER" }],
      profiles: ["western_decoz_v1"],
      schemaVersion: "1.0.0",
    },
  },
  "G-W-LP-001": {
    description: "Decoz Life Path worked example.",
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
    request: {
      asOfDate: "2026-08-31",
      civilDate: "1990-08-12",
      names: [{ id: "birth", kind: "birth_full", value: "THOMAS JOHN HANCOCK" }],
      profiles: ["western_decoz_v1"],
      schemaVersion: "1.0.0",
    },
  },
};

const FIXTURES: Readonly<Record<string, EngineFixture>> = deepFreeze(
  Object.fromEntries(
    Object.entries(FIXTURE_REQUESTS).map(([fixtureId, fixture]) => {
      const expectedWire = FIXTURE_EXPECTED[fixtureId];
      if (expectedWire === undefined) {
        throw new Error(`Missing golden expectation for fixture ${fixtureId}.`);
      }
      return [fixtureId, { ...fixture, expected: parseCalculationBundle(expectedWire) }];
    }),
  ),
);

export function listFixtures(): readonly string[] {
  return Object.freeze(Object.keys(FIXTURES).sort());
}

/** Returns the frozen synthetic request so higher-level evaluation can vary profile coverage safely. */
export function fixtureRequest(fixtureId: string): CalculationRequest {
  const fixture = FIXTURES[fixtureId];
  if (fixture === undefined) {
    throw new RangeError(`Unknown fixture: ${fixtureId}.`);
  }
  return fixture.request;
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
