import { homedir } from "node:os";
import { readRegistry } from "../core/registry";
import { fetchPlugin } from "../core/fetch";
import { PluginNotFoundError } from "../core/errors";

export interface UpdateOptions {
  home?: string;
}

export interface UpdateResult {
  pluginName: string;
  refreshed: boolean;
  nativeAgentHints: string[];
}

/**
 * For symlink-cached plugins, re-fetches into the same cache directory —
 * existing symlinks (pointing at paths inside it) keep resolving with no
 * relink step, since fetchPlugin preserves the directory path. For
 * native-marketplace agents, maui doesn't attempt to run an update command
 * itself (no non-interactive syntax was confirmed for any adapter's
 * "update" verb specifically); it reports a hint so the user can run that
 * agent's own update mechanism.
 */
export async function updatePlugin(name: string, options: UpdateOptions = {}): Promise<UpdateResult> {
  const home = options.home ?? homedir();
  const registry = await readRegistry(home);
  const entry = registry.plugins[name];

  if (!entry) {
    throw new PluginNotFoundError(name);
  }

  const hasSymlinkAgents = entry.agents.some((agent) => agent.kind === "symlink");
  const nativeAgentHints = entry.agents
    .filter((agent) => agent.kind === "native-marketplace")
    .map((agent) => `${agent.agent}: run that agent's own marketplace/extension update command`);

  if (hasSymlinkAgents) {
    await fetchPlugin(entry.source, home);
  }

  return { pluginName: name, refreshed: hasSymlinkAgents, nativeAgentHints };
}
