import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fetchPlugin } from "../core/fetch";
import { readManifest } from "../core/manifest";
import { linkChildren } from "../core/linker";
import { readRegistry, writeRegistry } from "../core/registry";
import { resolveContextFile } from "../core/context-file";
import { runHook } from "../core/postinstall";
import { readProjectConfig, recordProjectPlugin } from "../core/project-config";
import { getNativeMarketplaceAdapter, getSymlinkAdapter } from "../adapters/registry";
import { isNativeMarketplaceTarget } from "../types";
import type {
  InstalledAgentEntry,
  NativeMarketplaceIdentity,
  NativeMarketplaceTarget,
  PluginManifest,
  PostInstallContext,
  Scope,
  SymlinkTargetMap,
} from "../types";

export interface InstallOptions {
  home?: string;
  cwd?: string;
  scope?: Scope;
  /** Restrict install to only these agent IDs. Omitted/empty means "all detected". */
  agents?: string[];
  confirm?: (message: string) => Promise<boolean>;
}

export interface InstallResult {
  pluginName: string;
  agents: InstalledAgentEntry[];
  skipped: string[];
  failed: string[];
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

async function runPostinstallForAgent(
  manifest: PluginManifest,
  pluginDir: string,
  agentId: string,
  scope: Scope,
  home: string,
  cwd: string,
  confirm: InstallOptions["confirm"]
): Promise<string[]> {
  if (!manifest.postinstall) return [];

  const contextFile = resolveContextFile(agentId, scope, { home, projectRoot: cwd });
  const context: PostInstallContext = {
    agent: agentId,
    scope,
    scopeRoot: dirname(contextFile),
    contextFile,
    pluginDir,
    pluginName: manifest.name,
    version: manifest.version,
  };

  const { contextFilesWritten } = await runHook(
    join(pluginDir, manifest.postinstall),
    manifest.name,
    context,
    { home, confirm }
  );
  return contextFilesWritten;
}

async function installFromProjectConfig(
  home: string,
  cwd: string,
  options: InstallOptions
): Promise<InstallResult> {
  const projectConfig = await readProjectConfig(cwd);
  const pluginCount = projectConfig ? Object.keys(projectConfig.plugins).length : 0;
  if (!projectConfig || pluginCount === 0) {
    throw new Error(
      `No <source> given and no plugins recorded in ${join(cwd, ".maui", "config.json")} to reproduce`
    );
  }

  const agents: InstalledAgentEntry[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];
  for (const info of Object.values(projectConfig.plugins)) {
    const result = await installPlugin(info.source, { ...options, home, cwd, scope: "project" });
    agents.push(...result.agents);
    skipped.push(...result.skipped);
    failed.push(...result.failed);
  }

  return { pluginName: `${pluginCount} plugin(s) from project config`, agents, skipped, failed };
}

export async function installPlugin(
  source: string | undefined,
  options: InstallOptions = {}
): Promise<InstallResult> {
  const home = options.home ?? homedir();
  const cwd = options.cwd ?? process.cwd();
  const scope: Scope = options.scope ?? "global";

  if (!source) {
    if (scope !== "project") {
      throw new Error("maui install: missing <source> argument");
    }
    return installFromProjectConfig(home, cwd, options);
  }

  const pluginDir = await fetchPlugin(source, home);
  const manifest = await readManifest(pluginDir);

  const agents: InstalledAgentEntry[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];
  const agentFilter = options.agents && options.agents.length > 0 ? options.agents : undefined;

  for (const [agentId, target] of Object.entries(manifest.targets)) {
    if (agentFilter && !agentFilter.includes(agentId)) {
      skipped.push(`${agentId} (not in --agent filter)`);
      continue;
    }

    if (isNativeMarketplaceTarget(target)) {
      if (scope === "project") {
        skipped.push(`${agentId} (project-scope native-marketplace install not yet supported)`);
        continue;
      }

      const adapter = getNativeMarketplaceAdapter(agentId);
      if (!adapter) {
        skipped.push(`${agentId} (no adapter registered)`);
        continue;
      }
      if (!(await adapter.detect())) {
        skipped.push(`${agentId} (not detected)`);
        continue;
      }

      try {
        const identity = resolveNativeIdentity(manifest, target, source);
        await adapter.install(identity, { home, confirm: options.confirm });
        const contextFiles = await runPostinstallForAgent(
          manifest,
          pluginDir,
          agentId,
          scope,
          home,
          cwd,
          options.confirm
        );
        agents.push({
          agent: agentId,
          scope,
          kind: "native-marketplace",
          identity,
          ...(contextFiles.length > 0 ? { contextFiles } : {}),
        });
      } catch (error) {
        failed.push(`${agentId} (${(error as Error).message})`);
      }
    } else {
      const adapter = getSymlinkAdapter(agentId);
      if (!adapter) {
        skipped.push(`${agentId} (no adapter registered)`);
        continue;
      }

      let rootDir: string;
      if (scope === "project") {
        if (!adapter.projectRoot) {
          skipped.push(`${agentId} (no project-scope target)`);
          continue;
        }
        rootDir = adapter.projectRoot(cwd);
      } else {
        if (!adapter.globalRoot) {
          skipped.push(`${agentId} (no global-scope target)`);
          continue;
        }
        if (adapter.detect && !(await adapter.detect(home))) {
          skipped.push(`${agentId} (not detected)`);
          continue;
        }
        rootDir = adapter.globalRoot(home);
      }

      try {
        const symlinks: string[] = [];
        for (const [sourceRel, destRel] of Object.entries(target as SymlinkTargetMap)) {
          const result = await linkChildren(join(pluginDir, sourceRel), join(rootDir, destRel));
          symlinks.push(...result.linked);
        }
        if (adapter.linkExtra) {
          symlinks.push(...(await adapter.linkExtra(pluginDir, rootDir, manifest.name)));
        }
        const contextFiles = await runPostinstallForAgent(
          manifest,
          pluginDir,
          agentId,
          scope,
          home,
          cwd,
          options.confirm
        );
        agents.push({
          agent: agentId,
          scope,
          kind: "symlink",
          symlinks,
          ...(scope === "project" ? { projectRoot: cwd } : {}),
          ...(contextFiles.length > 0 ? { contextFiles } : {}),
        });
      } catch (error) {
        failed.push(`${agentId} (${(error as Error).message})`);
      }
    }
  }

  const registry = await readRegistry(home);
  const existing = registry.plugins[manifest.name];
  const previousAgents = existing?.agents ?? [];
  const touchedKeys = new Set(agents.map((a) => `${a.agent}:${a.scope}:${a.projectRoot ?? ""}`));
  const keptAgents = previousAgents.filter(
    (a) => !touchedKeys.has(`${a.agent}:${a.scope}:${a.projectRoot ?? ""}`)
  );

  registry.plugins[manifest.name] = {
    name: manifest.name,
    source,
    version: manifest.version,
    installedAt: existing?.installedAt ?? new Date().toISOString(),
    agents: [...keptAgents, ...agents],
  };
  await writeRegistry(registry, home);

  if (scope === "project") {
    await recordProjectPlugin(manifest.name, source, cwd);
  }

  return { pluginName: manifest.name, agents, skipped, failed };
}
