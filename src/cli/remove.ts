import { homedir } from "node:os";
import { join } from "node:path";
import { rm } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { readRegistry, writeRegistry } from "../core/registry";
import { unlinkChildren } from "../core/linker";
import { pluginsRoot } from "../core/fetch";
import { PluginNotFoundError } from "../core/errors";
import { getNativeMarketplaceAdapter } from "../adapters/registry";

export { PluginNotFoundError };

export interface RemoveOptions {
  home?: string;
  agents?: string[];
  purge?: boolean;
  confirmPurge?: (name: string) => Promise<boolean>;
}

async function defaultConfirmPurge(name: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(
      `Plugin "${name}" is still linked to other agents. Purge its cached source anyway? [y/N] `
    );
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
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
        await adapter.remove(agentEntry.identity, { home });
      }
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
