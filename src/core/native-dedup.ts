import type { NativeMarketplaceAdapter, Registry } from "../types";

/**
 * Decides whether a native-marketplace adapter's `.install()` call should
 * be skipped because an earlier selected plugin in the same
 * `installMarketplace` run already triggered it. Only adapters flagged
 * `installsWholeMarketplace` (e.g. Gemini) dedupe at all — mutates `seen`
 * as a side effect so the caller doesn't need to track state itself.
 */
export function shouldSkipNativeInstall(
  adapter: NativeMarketplaceAdapter,
  dedupeKey: string,
  seen: Set<string>
): boolean {
  if (!adapter.installsWholeMarketplace) {
    return false;
  }
  if (seen.has(dedupeKey)) {
    return true;
  }
  seen.add(dedupeKey);
  return false;
}

/**
 * Decides whether removing one plugin should skip a native-marketplace
 * adapter's `.remove()` call because a sibling plugin — another registry
 * entry sharing the same `sourceRepo` — still lists that same agent.
 * Only relevant for `installsWholeMarketplace` adapters: removing one
 * plugin from a shared whole-repo install (e.g. Gemini) must not tear it
 * out from under a sibling still depending on it.
 */
export function shouldSkipNativeRemove(
  adapter: NativeMarketplaceAdapter,
  registry: Registry,
  excludePluginName: string,
  sourceRepo: string | undefined,
  agentId: string
): boolean {
  if (!adapter.installsWholeMarketplace || !sourceRepo) {
    return false;
  }

  return Object.values(registry.plugins).some(
    (other) =>
      other.name !== excludePluginName &&
      other.sourceRepo === sourceRepo &&
      other.agents.some((agentEntry) => agentEntry.agent === agentId && agentEntry.kind === "native-marketplace")
  );
}
