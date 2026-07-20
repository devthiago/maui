export interface SymlinkTargetMap {
  [sourcePath: string]: string;
}

export interface NativeMarketplaceTarget {
  marketplace: true;
  repo?: string;
  plugin?: string;
  marketplaceName?: string;
  package?: string;
}

export type ManifestTarget = NativeMarketplaceTarget | SymlinkTargetMap;

export interface PluginManifest {
  name: string;
  version: string;
  description?: string;
  targets: Record<string, ManifestTarget>;
  postinstall?: string;
  postremove?: string;
}

export function isNativeMarketplaceTarget(
  target: ManifestTarget
): target is NativeMarketplaceTarget {
  return "marketplace" in target;
}

export type AdapterKind = "native-marketplace" | "symlink";
export type Scope = "global" | "project";

export interface InstalledAgentEntry {
  agent: string;
  scope: Scope;
  kind: AdapterKind;
  symlinks?: string[];
  contextFiles?: string[];
  identity?: NativeMarketplaceIdentity;
  projectRoot?: string;
}

export interface RegistryPluginEntry {
  name: string;
  source: string;
  version: string;
  installedAt: string;
  agents: InstalledAgentEntry[];
  /**
   * Absolute path of the shared cache directory this plugin's files live
   * under (~/.maui/plugins/<cache-key>/). Populated for every entry going
   * forward — single-plugin installs included, where it equals
   * `join(pluginsRoot(home), name)`. Absent on registries written before
   * this field existed; use `resolvePluginCacheDir` rather than reading it
   * directly so pre-migration entries still resolve correctly.
   */
  sourceRepo?: string;
  /**
   * Relative subpath within `sourceRepo` where this plugin's own
   * `maui.json`/source root actually lives (e.g. "plugins/plugin-one").
   * Only set for plugins installed from a multi-plugin marketplace source.
   */
  pluginPath?: string;
}

export interface Registry {
  plugins: Record<string, RegistryPluginEntry>;
}

export interface PostInstallContext {
  agent: string;
  scope: Scope;
  scopeRoot: string;
  contextFile: string;
  pluginDir: string;
  pluginName: string;
  version: string;
}

export interface NativeMarketplaceIdentity {
  pluginName: string;
  repo: string;
  marketplaceName: string;
  package?: string;
}

export interface NativeAdapterRuntimeOptions {
  home?: string;
  confirm?: (message: string) => Promise<boolean>;
}

export interface NativeMarketplaceAdapter {
  id: string;
  kind: "native-marketplace";
  detect(): Promise<boolean>;
  install(identity: NativeMarketplaceIdentity, options?: NativeAdapterRuntimeOptions): Promise<void>;
  remove(identity: NativeMarketplaceIdentity, options?: NativeAdapterRuntimeOptions): Promise<void>;
  /**
   * Set when this agent's own CLI installs an entire marketplace repo as
   * one unit with no per-plugin granularity (e.g. Gemini's `extensions
   * install <repo>`) — as opposed to genuinely installing/uninstalling one
   * named plugin at a time (Claude Code, Grok in marketplace mode). Drives
   * the install/remove dedup in `core/native-dedup.ts`: the native call
   * fires once per marketplace source rather than once per selected
   * plugin, and removing one plugin never tears down the shared install
   * while a sibling plugin from the same source still depends on it.
   */
  installsWholeMarketplace?: boolean;
}
