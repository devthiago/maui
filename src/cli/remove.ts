import { homedir } from "node:os";
import { join } from "node:path";
import { rm } from "node:fs/promises";
import { readRegistry, writeRegistry } from "../core/registry";
import { unlinkChildren } from "../core/linker";
import { pluginsRoot } from "../core/fetch";
import { PluginNotFoundError } from "../core/errors";
import { getNativeMarketplaceAdapter } from "../adapters/registry";
import { stripBlock } from "../core/postinstall";
import { confirm as confirmLine } from "../core/prompt";
import { shouldSkipNativeRemove } from "../core/native-dedup";

export { PluginNotFoundError };

export interface RemoveOptions {
  home?: string;
  agents?: string[];
  purge?: boolean;
  confirmPurge?: (name: string) => Promise<boolean>;
}

function defaultConfirmPurge(name: string): Promise<boolean> {
  return confirmLine(`Plugin "${name}" is still linked to other agents. Purge its cached source anyway?`);
}

export async function removePlugin(name: string, options: RemoveOptions = {}): Promise<void> {
  const home = options.home ?? homedir();
  const registry = await readRegistry(home);
  const entry = registry.plugins[name];

  if (!entry) {
    throw new PluginNotFoundError(name);
  }

  const toRemove = options.agents
    ? entry.agents.filter((agent) => options.agents!.includes(agent.agent))
    : entry.agents;
  const remaining = options.agents
    ? entry.agents.filter((agent) => !options.agents!.includes(agent.agent))
    : [];

  for (const agentEntry of toRemove) {
    if (agentEntry.kind === "symlink" && agentEntry.symlinks) {
      await unlinkChildren(agentEntry.symlinks);
    } else if (agentEntry.kind === "native-marketplace" && agentEntry.identity) {
      const adapter = getNativeMarketplaceAdapter(agentEntry.agent);
      if (adapter) {
        const skip = shouldSkipNativeRemove(adapter, registry, name, entry.sourceRepo, agentEntry.agent);
        if (!skip) {
          await adapter.remove(agentEntry.identity, {
            home,
            sourceMode: entry.pluginPath ? "marketplace" : "single",
          });
        }
      }
    }

    // Auto-cleanup: strip this plugin's marker-delimited block from every
    // contextFile a postinstall wrote to, whether or not a postremove
    // script is declared.
    for (const contextFile of agentEntry.contextFiles ?? []) {
      await stripBlock(contextFile, name);
    }
  }

  if (remaining.length > 0) {
    registry.plugins[name] = { ...entry, agents: remaining };
  } else {
    delete registry.plugins[name];
  }
  await writeRegistry(registry, home);

  if (options.purge) {
    const stillLinkedElsewhere = remaining.some((agent) => agent.kind === "symlink");
    if (stillLinkedElsewhere) {
      const confirm = options.confirmPurge ?? defaultConfirmPurge;
      const confirmed = await confirm(name);
      if (!confirmed) return;
    }
    await rm(join(pluginsRoot(home), name), { recursive: true, force: true });
  }
}
