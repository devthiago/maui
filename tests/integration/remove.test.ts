import { describe, it, expect } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir, lstat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installPlugin } from "../../src/cli/install";
import { removePlugin, PluginNotFoundError } from "../../src/cli/remove";
import { readRegistry, writeRegistry } from "../../src/core/registry";
import { pluginsRoot } from "../../src/core/fetch";

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

async function withTmpHome(fn: (home: string) => Promise<void>): Promise<void> {
  const home = await mkdtemp(join(tmpdir(), "maui-remove-home-"));
  try {
    await fn(home);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

async function makeFixturePlugin(name: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "maui-remove-plugin-"));
  await writeFile(
    join(dir, "maui.json"),
    JSON.stringify({ name, version: "1.0.0", targets: { _default: { "skills/": "skills/" } } })
  );
  await mkdir(join(dir, "skills", "example"), { recursive: true });
  await writeFile(join(dir, "skills", "example", "SKILL.md"), "# Example\n");
  return dir;
}

describe("removePlugin", () => {
  it("removes all symlinks and the registry entry", async () => {
    await withTmpHome(async (home) => {
      const source = await makeFixturePlugin("example-plugin");
      try {
        await installPlugin(source, { home });
        const linkedPath = join(home, ".agents", "skills", "example");
        expect(await pathExists(linkedPath)).toBe(true);

        await removePlugin("example-plugin", { home });

        expect(await pathExists(linkedPath)).toBe(false);
        const registry = await readRegistry(home);
        expect(registry.plugins["example-plugin"]).toBeUndefined();
      } finally {
        await rm(source, { recursive: true, force: true });
      }
    });
  });

  it("throws PluginNotFoundError for a plugin that isn't installed", async () => {
    await withTmpHome(async (home) => {
      await expect(removePlugin("nonexistent", { home })).rejects.toThrow(PluginNotFoundError);
    });
  });

  it("leaves the cached source in place without --purge", async () => {
    await withTmpHome(async (home) => {
      const source = await makeFixturePlugin("example-plugin");
      try {
        await installPlugin(source, { home });
        await removePlugin("example-plugin", { home });

        const cacheDir = join(pluginsRoot(home), "example-plugin");
        expect(await Bun.file(join(cacheDir, "maui.json")).exists()).toBe(true);
      } finally {
        await rm(source, { recursive: true, force: true });
      }
    });
  });

  it("deletes the cached source with --purge when nothing else is linked", async () => {
    await withTmpHome(async (home) => {
      const source = await makeFixturePlugin("example-plugin");
      try {
        await installPlugin(source, { home });
        await removePlugin("example-plugin", { home, purge: true });

        const cacheDir = join(pluginsRoot(home), "example-plugin");
        expect(await Bun.file(join(cacheDir, "maui.json")).exists()).toBe(false);
      } finally {
        await rm(source, { recursive: true, force: true });
      }
    });
  });

  it("asks for confirmation before purging when the plugin is still linked to another agent", async () => {
    await withTmpHome(async (home) => {
      const source = await makeFixturePlugin("example-plugin");
      try {
        await installPlugin(source, { home });

        const registry = await readRegistry(home);
        registry.plugins["example-plugin"]!.agents.push({
          agent: "cursor",
          scope: "global",
          kind: "symlink",
          symlinks: [],
        });
        await writeRegistry(registry, home);

        let asked = false;
        await removePlugin("example-plugin", {
          home,
          agents: ["_default"],
          purge: true,
          confirmPurge: async () => {
            asked = true;
            return true;
          },
        });

        expect(asked).toBe(true);
        const cacheDir = join(pluginsRoot(home), "example-plugin");
        expect(await Bun.file(join(cacheDir, "maui.json")).exists()).toBe(false);
      } finally {
        await rm(source, { recursive: true, force: true });
      }
    });
  });

  it("does not purge when the confirmation is declined", async () => {
    await withTmpHome(async (home) => {
      const source = await makeFixturePlugin("example-plugin");
      try {
        await installPlugin(source, { home });

        const registry = await readRegistry(home);
        registry.plugins["example-plugin"]!.agents.push({
          agent: "cursor",
          scope: "global",
          kind: "symlink",
          symlinks: [],
        });
        await writeRegistry(registry, home);

        await removePlugin("example-plugin", {
          home,
          agents: ["_default"],
          purge: true,
          confirmPurge: async () => false,
        });

        const cacheDir = join(pluginsRoot(home), "example-plugin");
        expect(await Bun.file(join(cacheDir, "maui.json")).exists()).toBe(true);
      } finally {
        await rm(source, { recursive: true, force: true });
      }
    });
  });
});
