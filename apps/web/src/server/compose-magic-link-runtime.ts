import {
  createMagicLinkHttpHandlers,
  type FieldProtector,
  systemClock,
} from "@numerology/application";
import { createPostgresMagicLinkRepository } from "@numerology/database/magic-link-repository";
import type { DatabasePool } from "@numerology/database/pool";
import { registerMagicLinkHandlers } from "./magic-link-runtime";
import { createSesMagicLinkSender } from "./ses-magic-link-sender";

/** Called by deployment bootstrap after validating secrets, migrations and trusted edge policy. */
export function configureMagicLinkRuntime(options: {
  pool: DatabasePool;
  protector: FieldProtector;
  origin: string;
  fromEmail: string;
  requestBudget: { consume(request: Request): Promise<boolean> };
}): void {
  registerMagicLinkHandlers(
    createMagicLinkHttpHandlers({
      origin: options.origin,
      clock: systemClock,
      protector: options.protector,
      repository: createPostgresMagicLinkRepository(options.pool),
      sender: createSesMagicLinkSender(options.fromEmail),
      requestBudget: options.requestBudget,
    }),
  );
}
