import type { Clock } from "./clock";
import type { FieldProtector } from "./field-protection";
import type { ReportIntentRepository } from "./report-intent-repository";

interface ExpireReportIntentsDependencies {
  readonly clock: Clock;
  readonly protector: FieldProtector;
  readonly repository: ReportIntentRepository;
}

interface ExpireReportIntentsInput {
  readonly limit: number;
}

interface ExpireReportIntentsResult {
  readonly expiredCount: number;
}

export function createExpireReportIntents(dependencies: ExpireReportIntentsDependencies) {
  return {
    async execute(input: ExpireReportIntentsInput): Promise<ExpireReportIntentsResult> {
      if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 500) {
        throw new RangeError("Expiry cleanup limit must be an integer from 1 through 500.");
      }
      const now = dependencies.clock.now();
      const tombstone = await dependencies.protector.protect("{}", "report_intent_draft");
      const expiredCount = await dependencies.repository.expireDueDrafts({
        before: now,
        limit: input.limit,
        now,
        tombstoneCiphertext: tombstone.ciphertext,
      });
      return { expiredCount };
    },
  };
}
