import { describe, it, expect } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installMarketplace } from "../../src/cli/install";
import { removePlugin } from "../../src/cli/remove";
import { readRegistry } from "../../src/core/registry";
import { pluginsRoot } from "../../src/core/fetch";

async function withTmpHome(fn: (home: string) => Promise<void>): Promise<void> {
  const home = await mkdtemp(join(tmpdir(), "maui-remove-marketplace-home-"));
  try {
    await fn(home);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

async function makeFixtureMarketplace(marketplaceName: string, pluginNames: string[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "maui-remove-fixture-marketplace-"));
  await mkdir(join(dir, ".claude-plugin"), { recursive: true });
  await writeFile(
    join(dir, ".claude-plugin", "marketplace.json"),
    JSON.stringify({
      name: marketplaceName,
      owner: { name: "example-user" },
      plugins: pluginNames.map((name) => ({ name, source: `./plugins/${name}`, description: "" })),
    })
  );
  for (const name of pluginNames) {
    await mkdir(join(dir, "plugins", name, "skills", `${name}-skill`), { recursive: true });
    await writeFile(
      join(dir, "plugins", name, "maui.json"),
      JSON.stringify({ name, version: "1.0.0", targets: { _default: { "skills/": "skills/" } } })
    );
    await writeFile(join(dir, "plugins", name, "skills", `${name}-skill`, "SKILL.md"), `# ${name}\n`);
  }
  return dir;
}

describe("removePlugin --purge on a shared marketplace clone", () => {
  it("purging one of two sibling plugins leaves the shared clone on disk, reporting why", async () => {
    await withTmpHome(async (home) => {
      const source = await makeFixtureMarketplace("my-toolkit", ["plugin-one", "plugin-two"]);
      try {
        await installMarketplace(source, { home, allPlugins: true });

        const sharedCacheDir = join(pluginsRoot(home), "my-toolkit");
        expect(await Bun.file(join(sharedCacheDir, "plugins", "plugin-one", "maui.json")).exists()).toBe(
          true
        );

        const result = await removePlugin("plugin-one", { home, purge: true });

        expect(result.purged).toBe(false);
        expect(result.purgeSkipped).toBeDefined();
        // the shared clone (and plugin-two's own files within it) survive
        expect(
          await Bun.file(join(sharedCacheDir, "plugins", "plugin-two", "maui.json")).exists()
        ).toBe(true);

        const registry = await readRegistry(home);
        expect(registry.plugins["plugin-one"]).toBeUndefined();
        expect(registry.plugins["plugin-two"]).toBeDefined();
      } finally {
        await rm(source, { recursive: true, force: true });
      }
    });
  });

  it("purging the last plugin referencing the shared clone actually deletes it (the fixed bug)", async () => {
    await withTmpHome(async (home) => {
      const source = await makeFixtureMarketplace("my-toolkit", ["plugin-one", "plugin-two"]);
      try {
        await installMarketplace(source, { home, allPlugins: true });
        const sharedCacheDir = join(pluginsRoot(home), "my-toolkit");

        await removePlugin("plugin-one", { home, purge: true });

        const result = await removePlugin("plugin-two", { home, purge: true });

        expect(result.purged).toBe(true);
        // the entire shared clone directory is now gone — not just the
        // registry entry — proving the cache-dir-key bug (rm targeting
        // ~/.maui/plugins/plugin-two, which never existed) is fixed.
        const stillExists = await Bun.file(join(sharedCacheDir, "plugins", "plugin-two", "maui.json")).exists();
        expect(stillExists).toBe(false);
      } finally {
        await rm(source, { recursive: true, force: true });
      }
    });
  });
});
