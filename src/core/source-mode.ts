import { join } from "node:path";

export interface MarketplaceCatalogEntry {
  name: string;
  description?: string;
  /** Relative subpath within the source's cache dir, e.g. "plugins/plugin-one". */
  pluginPath: string;
}

export type SourceMode =
  | { mode: "single" }
  | { mode: "marketplace"; marketplaceName: string; catalog: MarketplaceCatalogEntry[] }
  | { mode: "none" };

export class MarketplaceCatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarketplaceCatalogError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Classifies an already-fetched source root as single-plugin, multi-plugin
 * marketplace, or neither. A root maui.json always wins — checked first,
 * full stop — since that's what keeps every existing single-plugin fixture
 * (including the self-hosted single-plugin marketplace shape, which has
 * both maui.json and a "." -sourced marketplace.json) classified exactly as
 * it was before multi-plugin sources existed. Only when maui.json is
 * absent does a root .claude-plugin/marketplace.json get consulted, and
 * only its `./plugins/<name>`-shaped entries count as a real catalog.
 */
export async function detectSourceMode(rootDir: string): Promise<SourceMode> {
  const hasManifest = await Bun.file(join(rootDir, "maui.json")).exists();
  if (hasManifest) {
    return { mode: "single" };
  }

  const marketplaceJsonPath = join(rootDir, ".claude-plugin", "marketplace.json");
  const marketplaceFile = Bun.file(marketplaceJsonPath);
  if (!(await marketplaceFile.exists())) {
    return { mode: "none" };
  }

  let raw: unknown;
  try {
    raw = await marketplaceFile.json();
  } catch (error) {
    throw new MarketplaceCatalogError(
      `${marketplaceJsonPath} is not valid JSON: ${(error as Error).message}`
    );
  }

  if (!isRecord(raw)) {
    throw new MarketplaceCatalogError(`${marketplaceJsonPath} must be a JSON object`);
  }

  const { name, plugins } = raw;
  if (typeof name !== "string" || name.length === 0) {
    throw new MarketplaceCatalogError(`${marketplaceJsonPath} is missing a required "name" string`);
  }
  if (!Array.isArray(plugins)) {
    throw new MarketplaceCatalogError(`${marketplaceJsonPath} is missing a required "plugins" array`);
  }

  const catalog: MarketplaceCatalogEntry[] = [];
  for (const entry of plugins) {
    if (!isRecord(entry)) continue;
    const { name: pluginName, description, source } = entry;
    if (typeof pluginName !== "string" || typeof source !== "string") continue;

    const match = /^\.\/(.+)$/.exec(source);
    if (!match) continue; // "." / "./" (self-hosted single-plugin shape) — not a subfolder entry

    catalog.push({
      name: pluginName,
      description: typeof description === "string" ? description : undefined,
      pluginPath: match[1]!,
    });
  }

  if (catalog.length === 0) {
    return { mode: "none" };
  }

  return { mode: "marketplace", marketplaceName: name, catalog };
}
