import { homedir } from "node:os";
import { readRegistry, resolvePluginCacheDir } from "../core/registry";
import { fetchSource, type FetchedSource } from "../core/fetch";
import { PluginNotFoundError } from "../core/errors";
import type { RegistryPluginEntry } from "../types";

export interface UpdateOptions {
  home?: string;
  /** Injectable for testing — defaults to the real fetchSource. */
  fetchImpl?: (source: string, home?: string) => Promise<FetchedSource>;
}

export interface UpdateResult {
  pluginName: string;
  refreshed: boolean;
  nativeAgentHints: string[];
}

function computeHints(entry: RegistryPluginEntry): {
  hasSymlinkAgents: boolean;
  nativeAgentHints: string[];
} {
  const hasSymlinkAgents = entry.agents.some((agent) => agent.kind === "symlink");
  const nativeAgentHints = entry.agents
    .filter((agent) => agent.kind === "native-marketplace")
    .map((agent) => `${agent.agent}: run that agent's own marketplace/extension update command`);
  return { hasSymlinkAgents, nativeAgentHints };
}

/**
 * For symlink-cached plugins, re-fetches into the same cache directory —
 * existing symlinks (pointing at paths inside it) keep resolving with no
 * relink step, since fetchSource preserves the directory path. For
 * native-marketplace agents, maui doesn't attempt to run an update command
 * itself (no non-interactive syntax was confirmed for any adapter's
 * "update" verb specifically); it reports a hint so the user can run that
 * agent's own update mechanism.
 */
export async function updatePlugin(name: string, options: UpdateOptions = {}): Promise<UpdateResult> {
  const home = options.home ?? homedir();
  const fetchImpl = options.fetchImpl ?? fetchSource;
  const registry = await readRegistry(home);
  const entry = registry.plugins[name];

  if (!entry) {
    throw new PluginNotFoundError(name);
  }

  const { hasSymlinkAgents, nativeAgentHints } = computeHints(entry);
  if (hasSymlinkAgents) {
    await fetchImpl(entry.source, home);
  }

  return { pluginName: name, refreshed: hasSymlinkAgents, nativeAgentHints };
}

/**
 * Updates every installed plugin for a bare `maui update`, deduping by
 * shared cache dir (`sourceRepo`) so plugins sharing one marketplace clone
 * only trigger one actual re-fetch, not one per plugin.
 */
export async function updateAll(options: UpdateOptions = {}): Promise<UpdateResult[]> {
  const home = options.home ?? homedir();
  const fetchImpl = options.fetchImpl ?? fetchSource;
  const registry = await readRegistry(home);
  const names = Object.keys(registry.plugins);

  const refreshedCacheDirs = new Set<string>();
  const results: UpdateResult[] = [];
  for (const name of names) {
    const entry = registry.plugins[name]!;
    const { hasSymlinkAgents, nativeAgentHints } = computeHints(entry);

    if (hasSymlinkAgents) {
      const cacheDir = resolvePluginCacheDir(entry, home);
      if (!refreshedCacheDirs.has(cacheDir)) {
        await fetchImpl(entry.source, home);
        refreshedCacheDirs.add(cacheDir);
      }
    }

    results.push({ pluginName: name, refreshed: hasSymlinkAgents, nativeAgentHints });
  }
  return results;
}
