import type { AppEnvironment } from "@numerology/contracts";
import checkpointFourRelease from "@numerology/doctrine-data/doctrine/checkpoint4-fallback.compiled.json";
import {
  buildCheckpointFourReportFixture,
  CHECKPOINT4_FIXTURE_REPORT_ID,
  type CheckpointFourReportFixture,
  isReportId,
  parseReportId,
} from "@numerology/report";

export function isReportFixtureEnvironment(environment: AppEnvironment["APP_ENV"]): boolean {
  return environment === "development" || environment === "test";
}

/** Resolves only the committed synthetic fixture; arbitrary report IDs never reach persistence. */
export function loadSyntheticReportFixture(id: string): CheckpointFourReportFixture | null {
  if (!isReportId(id) || parseReportId(id) !== CHECKPOINT4_FIXTURE_REPORT_ID) {
    return null;
  }
  return buildCheckpointFourReportFixture(checkpointFourRelease);
}
