import { homedir } from "node:os";
import { join } from "node:path";
import { fetchPlugin } from "../core/fetch";
import { readManifest } from "../core/manifest";
import { linkChildren } from "../core/linker";
import { readRegistry, writeRegistry } from "../core/registry";
import { genericAgentsAdapter } from "../adapters/generic-agents";
import { isNativeMarketplaceTarget } from "../types";
import type { InstalledAgentEntry, SymlinkTargetMap } from "../types";

export interface InstallOptions {
  home?: string;
}

export interface InstallResult {
  pluginName: string;
  agents: InstalledAgentEntry[];
}

export async function installPlugin(
  source: string,
  options: InstallOptions = {}
): Promise<InstallResult> {
  const home = options.home ?? homedir();

  const pluginDir = await fetchPlugin(source, home);
  const manifest = await readManifest(pluginDir);

  const agents: InstalledAgentEntry[] = [];

  const defaultTarget = manifest.targets._default;
  if (defaultTarget && !isNativeMarketplaceTarget(defaultTarget)) {
    const symlinks: string[] = [];
    for (const [sourceRel, destRel] of Object.entries(defaultTarget as SymlinkTargetMap)) {
      const sourceChildDir = join(pluginDir, sourceRel);
      const containerDir = join(genericAgentsAdapter.globalRoot(home), destRel);
      const result = await linkChildren(sourceChildDir, containerDir);
      symlinks.push(...result.linked);
    }
    agents.push({ agent: genericAgentsAdapter.id, scope: "global", kind: "symlink", symlinks });
  }

  const registry = await readRegistry(home);
  registry.plugins[manifest.name] = {
    name: manifest.name,
    source,
    version: manifest.version,
    installedAt: new Date().toISOString(),
    agents,
  };
  await writeRegistry(registry, home);

  return { pluginName: manifest.name, agents };
}
