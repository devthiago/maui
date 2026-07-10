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
}

export interface RegistryPluginEntry {
  name: string;
  source: string;
  version: string;
  installedAt: string;
  agents: InstalledAgentEntry[];
}

export interface Registry {
  plugins: Record<string, RegistryPluginEntry>;
}

export interface NativeMarketplaceIdentity {
  pluginName: string;
  repo: string;
  marketplaceName: string;
}

export interface NativeMarketplaceAdapter {
  id: string;
  kind: "native-marketplace";
  detect(): Promise<boolean>;
  install(identity: NativeMarketplaceIdentity): Promise<void>;
  remove(identity: NativeMarketplaceIdentity): Promise<void>;
}
