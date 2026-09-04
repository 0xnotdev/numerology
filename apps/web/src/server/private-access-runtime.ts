import type { PrivateAccessHttpHandlers } from "@numerology/application";
import { createPrivateAccessRouteAdapters } from "./private-access-routes";

const runtimeKey = Symbol.for("numerology.private-access-runtime");
type RuntimeGlobal = typeof globalThis & { [runtimeKey]?: PrivateAccessHttpHandlers };

/** Register only fully configured durable dependencies; production has no in-memory fallback. */
export function registerPrivateAccessHandlers(handlers: PrivateAccessHttpHandlers): void {
  const target = globalThis as RuntimeGlobal;
  if (target[runtimeKey] !== undefined && target[runtimeKey] !== handlers) {
    throw new Error("PRIVATE_ACCESS_RUNTIME_ALREADY_REGISTERED");
  }
  target[runtimeKey] = handlers;
}

export const privateAccessRoutes = createPrivateAccessRouteAdapters(
  () => (globalThis as RuntimeGlobal)[runtimeKey] ?? null,
);
