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
