import type { MagicLinkHttpHandlers } from "@numerology/application";
import { createMagicLinkRoutes } from "./magic-link-routes";

const key = Symbol.for("numerology.magic-link-runtime");
type Runtime = typeof globalThis & { [key]?: MagicLinkHttpHandlers };
/** Register only fully configured durable dependencies. Never install an in-memory production fallback. */
export function registerMagicLinkHandlers(handlers: MagicLinkHttpHandlers): void {
  const target = globalThis as Runtime;
  if (target[key] && target[key] !== handlers)
    throw new Error("MAGIC_LINK_RUNTIME_ALREADY_REGISTERED");
  target[key] = handlers;
}
export const magicLinkRoutes = createMagicLinkRoutes(() => (globalThis as Runtime)[key] ?? null);
