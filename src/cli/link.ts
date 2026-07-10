import { homedir } from "node:os";
import { join } from "node:path";
import { readManifest } from "../core/manifest";
import { linkChildren } from "../core/linker";
import { readRegistry, writeRegistry } from "../core/registry";
import { pluginsRoot } from "../core/fetch";
import { getSymlinkAdapter } from "../adapters/registry";
import { isNativeMarketplaceTarget } from "../types";
import type { SymlinkTargetMap } from "../types";

export class PluginNotCachedError extends Error {
  constructor(name: string) {
    super(`Plugin "${name}" has not been fetched yet — run "maui install" first`);
    this.name = "PluginNotCachedError";
  }
}

export class UnknownAgentError extends Error {
  constructor(agentId: string) {
    super(`Unknown agent "${agentId}"`);
    this.name = "UnknownAgentError";
  }
}

export class NoTargetForAgentError extends Error {
  constructor(pluginName: string, agentId: string) {
    super(`Plugin "${pluginName}" has no target mapping for agent "${agentId}"`);
    this.name = "NoTargetForAgentError";
  }
}

export interface LinkOptions {
  home?: string;
}

export async function linkPlugin(
  name: string,
  agentId: string,
  options: LinkOptions = {}
): Promise<void> {
  const home = options.home ?? homedir();
  const pluginDir = join(pluginsRoot(home), name);

  const manifest = await readManifest(pluginDir).catch(() => {
    throw new PluginNotCachedError(name);
  });

  const adapter = getSymlinkAdapter(agentId);
  if (!adapter) {
    throw new UnknownAgentError(agentId);
  }

  const target = manifest.targets[agentId];
  if (!target || isNativeMarketplaceTarget(target)) {
    throw new NoTargetForAgentError(name, agentId);
  }

  const symlinks: string[] = [];
  for (const [sourceRel, destRel] of Object.entries(target as SymlinkTargetMap)) {
    const result = await linkChildren(
      join(pluginDir, sourceRel),
      join(adapter.globalRoot(home), destRel)
    );
    symlinks.push(...result.linked);
  }

  const registry = await readRegistry(home);
  const entry = registry.plugins[name] ?? {
    name: manifest.name,
    source: "unknown",
    version: manifest.version,
    installedAt: new Date().toISOString(),
    agents: [],
  };
  entry.agents = [
    ...entry.agents.filter((existing) => existing.agent !== agentId),
    { agent: agentId, scope: "global", kind: "symlink", symlinks },
  ];
  registry.plugins[name] = entry;
  await writeRegistry(registry, home);
}
