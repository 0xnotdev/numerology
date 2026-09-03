import type { Clock } from "./clock";

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly retryAfterSeconds: number;
}

interface WindowState {
  count: number;
  startedAt: number;
}

/**
 * Small-process limiter for tests and local development. Production must inject a shared,
 * distributed implementation at the HTTP port; this adapter is deliberately not a deployment
 * wide security boundary.
 */
export function createRateLimiter({ clock }: { readonly clock: Clock }) {
  const windows = new Map<string, WindowState>();
  return {
    consume(key: string, limit: number, windowMs: number): RateLimitDecision {
      if (
        key.length === 0 ||
        key.length > 256 ||
        !Number.isSafeInteger(limit) ||
        limit < 1 ||
        limit > 1_000 ||
        !Number.isSafeInteger(windowMs) ||
        windowMs < 1_000 ||
        windowMs > 86_400_000
      ) {
        throw new RangeError("RATE_LIMIT_INPUT_INVALID");
      }
      const now = clock.now().valueOf();
      if (!Number.isFinite(now)) throw new RangeError("RATE_LIMIT_CLOCK_INVALID");
      const current = windows.get(key);
      const state =
        current === undefined || now - current.startedAt >= windowMs
          ? { count: 0, startedAt: now }
          : current;
      if (state.count >= limit) {
        return {
          allowed: false,
          remaining: 0,
          retryAfterSeconds: Math.max(1, Math.ceil((state.startedAt + windowMs - now) / 1_000)),
        };
      }
      state.count += 1;
      windows.set(key, state);
      return { allowed: true, remaining: limit - state.count, retryAfterSeconds: 0 };
    },
  };
}
