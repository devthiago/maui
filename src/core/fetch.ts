import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";
import { readManifest } from "./manifest";
import { detectSourceMode, type MarketplaceCatalogEntry } from "./source-mode";

export function pluginsRoot(home: string = homedir()): string {
  return join(home, ".maui", "plugins");
}

function isGitSource(source: string): boolean {
  return (
    /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(source) || // any scheme://
    /^[\w.-]+@[\w.-]+:/.test(source) || // git@host:path SSH shorthand
    source.endsWith(".git")
  );
}

export type FetchedSource =
  | { mode: "single"; cacheDir: string }
  | {
      mode: "marketplace";
      cacheDir: string;
      marketplaceName: string;
      catalog: MarketplaceCatalogEntry[];
    };

/**
 * Populates a shared cache dir from a git URL or local dev path, always
 * wiping and recopying the target so re-fetching the same source is
 * idempotent. Symlinks created into this directory's children (by the
 * linker) still resolve correctly after a refresh, since the directory path
 * itself is stable even though its contents were replaced.
 *
 * The cache key depends on `detectSourceMode`: a single-plugin source is
 * keyed by its one `maui.json`'s `name` (unchanged from before multi-plugin
 * sources existed); a marketplace source is keyed by its catalog's own
 * name instead, so every plugin it catalogs shares one clone.
 */
export async function fetchSource(source: string, home: string = homedir()): Promise<FetchedSource> {
  const staging = await mkdtemp(join(tmpdir(), "maui-fetch-"));

  try {
    if (isGitSource(source)) {
      await $`git clone ${source} ${staging}`.quiet();
    } else {
      await cp(source, staging, { recursive: true });
    }

    const sourceMode = await detectSourceMode(staging);

    let cacheKey: string;
    let result: FetchedSource;
    if (sourceMode.mode === "marketplace") {
      cacheKey = sourceMode.marketplaceName;
      result = {
        mode: "marketplace",
        cacheDir: join(pluginsRoot(home), cacheKey),
        marketplaceName: sourceMode.marketplaceName,
        catalog: sourceMode.catalog,
      };
    } else {
      // "single" and "none" both resolve via readManifest: "single" reads
      // the confirmed maui.json; "none" throws the same
      // ManifestValidationError it always has, unchanged.
      const manifest = await readManifest(staging);
      cacheKey = manifest.name;
      result = { mode: "single", cacheDir: join(pluginsRoot(home), cacheKey) };
    }

    await mkdir(pluginsRoot(home), { recursive: true });
    await rm(result.cacheDir, { recursive: true, force: true });
    await cp(staging, result.cacheDir, { recursive: true });

    return result;
  } finally {
    await rm(staging, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Single-plugin-only wrapper around fetchSource, preserved so existing
 * callers don't need to change shape.
 */
export async function fetchPlugin(source: string, home: string = homedir()): Promise<string> {
  const result = await fetchSource(source, home);
  return result.cacheDir;
}
