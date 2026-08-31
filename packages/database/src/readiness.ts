import type { Pool } from "pg";

export interface DatabaseReadinessProbe {
  check(): Promise<boolean>;
}

export interface DatabaseReadinessProbeOptions {
  readonly timeoutMs?: number;
}

export function createDatabaseReadinessProbe(
  pool: Pick<Pool, "query">,
  options: DatabaseReadinessProbeOptions = {},
): DatabaseReadinessProbe {
  const timeoutMs = options.timeoutMs ?? 75;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 99) {
    throw new RangeError(
      "Database readiness timeout must be an integer from 1 to 99 milliseconds.",
    );
  }

  return {
    async check(): Promise<boolean> {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const query = Promise.resolve()
        .then(() => pool.query("SELECT 1"))
        .then(
          () => true,
          () => false,
        );
      const deadline = new Promise<boolean>((resolve) => {
        timeout = setTimeout(() => resolve(false), timeoutMs);
      });

      try {
        return await Promise.race([query, deadline]);
      } finally {
        if (timeout !== undefined) {
          clearTimeout(timeout);
        }
      }
    },
  };
}
