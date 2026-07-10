import { homedir } from "node:os";
import { join } from "node:path";
import { fetchPlugin } from "../core/fetch";
import { readManifest } from "../core/manifest";
import { linkChildren } from "../core/linker";
import { readRegistry, writeRegistry } from "../core/registry";
import { getNativeMarketplaceAdapter, getSymlinkAdapter } from "../adapters/registry";
import { isNativeMarketplaceTarget } from "../types";
import type {
  InstalledAgentEntry,
  NativeMarketplaceIdentity,
  NativeMarketplaceTarget,
  PluginManifest,
  SymlinkTargetMap,
} from "../types";

export interface InstallOptions {
  home?: string;
  confirm?: (message: string) => Promise<boolean>;
}

export interface InstallResult {
  pluginName: string;
  agents: InstalledAgentEntry[];
  skipped: string[];
}

function resolveNativeIdentity(
  manifest: PluginManifest,
  target: NativeMarketplaceTarget,
  source: string
): NativeMarketplaceIdentity {
  const repo = target.repo ?? source;
  const pluginName = target.plugin ?? manifest.name;
  const marketplaceName =
    target.marketplaceName ?? repo.split("/").pop()?.replace(/\.git$/, "") ?? manifest.name;

  return { pluginName, repo, marketplaceName, package: target.package };
}

export async function installPlugin(
  source: string,
  options: InstallOptions = {}
): Promise<InstallResult> {
  const home = options.home ?? homedir();

  const pluginDir = await fetchPlugin(source, home);
  const manifest = await readManifest(pluginDir);

  const agents: InstalledAgentEntry[] = [];
  const skipped: string[] = [];

  for (const [agentId, target] of Object.entries(manifest.targets)) {
    if (isNativeMarketplaceTarget(target)) {
      const adapter = getNativeMarketplaceAdapter(agentId);
      if (!adapter) {
        skipped.push(`${agentId} (no adapter registered)`);
        continue;
      }
      if (!(await adapter.detect())) {
        skipped.push(`${agentId} (not detected)`);
        continue;
      }

      const identity = resolveNativeIdentity(manifest, target, source);
      await adapter.install(identity, { home, confirm: options.confirm });
      agents.push({ agent: agentId, scope: "global", kind: "native-marketplace", identity });
    } else {
      const adapter = getSymlinkAdapter(agentId);
      if (!adapter) {
        skipped.push(`${agentId} (no adapter registered)`);
        continue;
      }
      if (adapter.detect && !(await adapter.detect(home))) {
        skipped.push(`${agentId} (not detected)`);
        continue;
      }

      const symlinks: string[] = [];
      for (const [sourceRel, destRel] of Object.entries(target as SymlinkTargetMap)) {
        const result = await linkChildren(
          join(pluginDir, sourceRel),
          join(adapter.globalRoot(home), destRel)
        );
        symlinks.push(...result.linked);
      }
      agents.push({ agent: agentId, scope: "global", kind: "symlink", symlinks });
    }
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

  return { pluginName: manifest.name, agents, skipped };
}
