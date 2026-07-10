import { homedir } from "node:os";
import { readRegistry, writeRegistry } from "../core/registry";
import { unlinkChildren } from "../core/linker";
import { PluginNotFoundError } from "../core/errors";

export { PluginNotFoundError };

export class AgentNotLinkedError extends Error {
  constructor(name: string, agentId: string) {
    super(`Plugin "${name}" is not linked to agent "${agentId}"`);
    this.name = "AgentNotLinkedError";
  }
}

export interface UnlinkOptions {
  home?: string;
}

export async function unlinkPlugin(
  name: string,
  agentId: string,
  options: UnlinkOptions = {}
): Promise<void> {
  const home = options.home ?? homedir();
  const registry = await readRegistry(home);
  const entry = registry.plugins[name];

  if (!entry) {
    throw new PluginNotFoundError(name);
  }

  const agentEntry = entry.agents.find((agent) => agent.agent === agentId);
  if (!agentEntry) {
    throw new AgentNotLinkedError(name, agentId);
  }

  if (agentEntry.kind === "symlink" && agentEntry.symlinks) {
    await unlinkChildren(agentEntry.symlinks);
  }

  entry.agents = entry.agents.filter((agent) => agent.agent !== agentId);
  registry.plugins[name] = entry;
  await writeRegistry(registry, home);
}
