import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fetchSource, type FetchedSource } from "../core/fetch";
import { readManifest } from "../core/manifest";
import { linkChildren } from "../core/linker";
import { readRegistry, writeRegistry } from "../core/registry";
import { resolveContextFile } from "../core/context-file";
import { runHook } from "../core/postinstall";
import { readProjectConfig, recordProjectPlugin } from "../core/project-config";
import { getNativeMarketplaceAdapter, getSymlinkAdapter } from "../adapters/registry";
import { isNativeMarketplaceTarget } from "../types";
import { selectPlugins, type PluginSelectionOptions } from "../core/plugin-selection";
import { MarketplaceModeMismatchError } from "../core/errors";
import { shouldSkipNativeInstall } from "../core/native-dedup";
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

/**
 * `wholeMarketplaceName`, when given, stands in for the individual
 * plugin's own name as the pluginName fallback — needed for adapters like
 * Gemini whose `installsWholeMarketplace` means the installed "thing" is
 * identified by the marketplace's own name (matching what its install
 * command actually registered), not any one plugin's name. An explicit
 * `target.plugin` override still wins over both.
 */
function resolveNativeIdentity(
  manifest: PluginManifest,
  target: NativeMarketplaceTarget,
  source: string,
  wholeMarketplaceName?: string
): NativeMarketplaceIdentity {
  const repo = target.repo ?? source;
  const pluginName = target.plugin ?? wholeMarketplaceName ?? manifest.name;
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

/**
 * Runs the per-target dispatch loop (native-marketplace + symlink) for one
 * already-fetched plugin and writes its registry entry. Shared by
 * single-plugin installs (`sourceRepo` equals `pluginDir`, no `pluginPath`)
 * and marketplace-mode installs (`sourceRepo` is the shared clone,
 * `pluginPath` locates this plugin's subfolder within it) — this is the
 * only place that writes a plugin's registry entry, so both paths stay in
 * sync automatically.
 */
async function installOnePlugin(
  pluginDir: string,
  manifest: PluginManifest,
  source: string,
  sourceRepo: string,
  pluginPath: string | undefined,
  options: InstallOptions,
  wholeMarketplaceInstalled: Set<string> = new Set()
): Promise<InstallResult> {
  const home = options.home ?? homedir();
  const cwd = options.cwd ?? process.cwd();
  const scope: Scope = options.scope ?? "global";

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
        const wholeMarketplaceName =
          adapter.installsWholeMarketplace && pluginPath ? basename(sourceRepo) : undefined;
        const identity = resolveNativeIdentity(manifest, target, source, wholeMarketplaceName);
        const dedupeKey = `${sourceRepo}:${agentId}`;
        if (!shouldSkipNativeInstall(adapter, dedupeKey, wholeMarketplaceInstalled)) {
          await adapter.install(identity, { home, confirm: options.confirm });
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
    sourceRepo,
    ...(pluginPath ? { pluginPath } : {}),
  };
  await writeRegistry(registry, home);

  if (scope === "project") {
    await recordProjectPlugin(manifest.name, source, cwd);
  }

  return { pluginName: manifest.name, agents, skipped, failed };
}

async function installFetchedMarketplace(
  fetched: Extract<FetchedSource, { mode: "marketplace" }>,
  source: string,
  options: InstallOptions & PluginSelectionOptions
): Promise<InstallResult[]> {
  const selected = await selectPlugins(fetched.catalog, options);
  const wholeMarketplaceInstalled = new Set<string>();
  const results: InstallResult[] = [];
  for (const entry of selected) {
    const pluginDir = join(fetched.cacheDir, entry.pluginPath);
    const manifest = await readManifest(pluginDir);
    results.push(
      await installOnePlugin(
        pluginDir,
        manifest,
        source,
        fetched.cacheDir,
        entry.pluginPath,
        options,
        wholeMarketplaceInstalled
      )
    );
  }
  return results;
}

/**
 * Single-plugin-only entrypoint — kept byte-for-byte compatible in
 * signature/behavior with the original v1 `installPlugin` for existing
 * callers. Throws if `source` turns out to be a multi-plugin marketplace;
 * use `installFromSource`/`installMarketplace` for that case instead of
 * guessing which plugin(s) to install.
 */
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

  const fetched = await fetchSource(source, home);
  if (fetched.mode === "marketplace") {
    throw new MarketplaceModeMismatchError("single", fetched.mode);
  }

  const manifest = await readManifest(fetched.cacheDir);
  return installOnePlugin(fetched.cacheDir, manifest, source, fetched.cacheDir, undefined, options);
}

/**
 * Multi-plugin-marketplace-only entrypoint. Throws if `source` turns out to
 * be single-plugin; use `installPlugin`/`installFromSource` for that case.
 */
export async function installMarketplace(
  source: string,
  options: InstallOptions & PluginSelectionOptions = {}
): Promise<InstallResult[]> {
  const home = options.home ?? homedir();
  const fetched = await fetchSource(source, home);
  if (fetched.mode !== "marketplace") {
    throw new MarketplaceModeMismatchError("marketplace", fetched.mode);
  }

  return installFetchedMarketplace(fetched, source, options);
}

/**
 * Detects which shape `source` is and dispatches accordingly — the
 * function the CLI actually calls, since it doesn't know in advance
 * whether a source is single-plugin or a marketplace. Always returns an
 * array (length 1 for single-plugin/project-config sources).
 */
export async function installFromSource(
  source: string | undefined,
  options: InstallOptions & PluginSelectionOptions = {}
): Promise<InstallResult[]> {
  const home = options.home ?? homedir();
  const cwd = options.cwd ?? process.cwd();
  const scope: Scope = options.scope ?? "global";

  if (!source) {
    if (scope !== "project") {
      throw new Error("maui install: missing <source> argument");
    }
    return [await installFromProjectConfig(home, cwd, options)];
  }

  const fetched = await fetchSource(source, home);
  if (fetched.mode === "marketplace") {
    return installFetchedMarketplace(fetched, source, options);
  }

  const manifest = await readManifest(fetched.cacheDir);
  return [
    await installOnePlugin(fetched.cacheDir, manifest, source, fetched.cacheDir, undefined, options),
  ];
}
