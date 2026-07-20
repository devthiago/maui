import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type { Registry, RegistryPluginEntry } from "../types";
import { pluginsRoot } from "./fetch";

export function registryPath(home: string = homedir()): string {
  return join(home, ".maui", "registry.json");
}

function emptyRegistry(): Registry {
  return { plugins: {} };
}

export async function readRegistry(home: string = homedir()): Promise<Registry> {
  const file = Bun.file(registryPath(home));

  if (!(await file.exists())) {
    return emptyRegistry();
  }

  return (await file.json()) as Registry;
}

export async function writeRegistry(registry: Registry, home: string = homedir()): Promise<void> {
  const path = registryPath(home);
  await mkdir(dirname(path), { recursive: true });
  await Bun.write(path, JSON.stringify(registry, null, 2));
}

/**
 * Resolves the absolute cache directory a registry entry's files live
 * under. Falls back to `pluginsRoot/name` for entries written before
 * `sourceRepo` existed, so pre-migration registries keep working.
 */
export function resolvePluginCacheDir(entry: RegistryPluginEntry, home: string = homedir()): string {
  return entry.sourceRepo ?? join(pluginsRoot(home), entry.name);
}
