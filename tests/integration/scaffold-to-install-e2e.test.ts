import { describe, it, expect } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scaffoldMarketplace, scaffoldPlugin } from "../../src/core/scaffold";
import { installMarketplace } from "../../src/cli/install";
import { removePlugin } from "../../src/cli/remove";
import { readRegistry } from "../../src/core/registry";
import { pluginsRoot } from "../../src/core/fetch";

async function withTmpHome(fn: (home: string) => Promise<void>): Promise<void> {
  const home = await mkdtemp(join(tmpdir(), "maui-e2e-home-"));
  try {
    await fn(home);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

/**
 * Phase 12's final checkpoint: `create-marketplace` + `create-plugin`
 * twice produces a real two-plugin repo installable end to end via `maui
 * install --all-plugins`, and removal correctly leaves the shared clone
 * intact until the last plugin referencing it is purged. Uses the real
 * scaffold.ts output (not a hand-authored fixture) restricted to the
 * `_default` symlink target, since the scaffolded manifest also declares
 * native-marketplace targets for claude-code/codex/gemini/grok that would
 * otherwise need four separate fake CLIs on $PATH — already proven
 * per-adapter in Tasks 41/43/44/46.
 */
describe("scaffold → install → remove, end to end (Phase 12 final checkpoint)", () => {
  it("installs both scaffolded plugins independently, then purges the shared clone only after the last one is removed", async () => {
    await withTmpHome(async (home) => {
      const root = await mkdtemp(join(tmpdir(), "maui-e2e-repo-"));
      const repoDir = join(root, "my-toolkit");
      try {
        await scaffoldMarketplace({
          marketplaceName: "my-toolkit",
          githubUser: "example-user",
          targetDir: repoDir,
        });
        await scaffoldPlugin({ pluginName: "plugin-one", githubUser: "example-user", cwd: repoDir });
        await scaffoldPlugin({ pluginName: "plugin-two", githubUser: "example-user", cwd: repoDir });

        const results = await installMarketplace(repoDir, {
          home,
          allPlugins: true,
          agents: ["_default"],
        });
        expect(results.map((r) => r.pluginName).sort()).toEqual(["plugin-one", "plugin-two"]);

        const registry = await readRegistry(home);
        const one = registry.plugins["plugin-one"];
        const two = registry.plugins["plugin-two"];
        expect(one?.sourceRepo).toBeDefined();
        expect(one?.sourceRepo).toBe(two?.sourceRepo);
        expect(one?.pluginPath).toBe("plugins/plugin-one");
        expect(two?.pluginPath).toBe("plugins/plugin-two");

        const sharedCacheDir = join(pluginsRoot(home), "my-toolkit");
        expect(await Bun.file(join(sharedCacheDir, "plugins", "plugin-one", "maui.json")).exists()).toBe(
          true
        );

        // Removing the first plugin leaves the shared clone (and the
        // sibling's own files within it) intact.
        const firstRemoval = await removePlugin("plugin-one", { home, purge: true });
        expect(firstRemoval.purged).toBe(false);
        expect(firstRemoval.purgeSkipped).toBeDefined();
        expect(
          await Bun.file(join(sharedCacheDir, "plugins", "plugin-two", "maui.json")).exists()
        ).toBe(true);

        // Removing the last plugin actually purges the shared clone.
        const secondRemoval = await removePlugin("plugin-two", { home, purge: true });
        expect(secondRemoval.purged).toBe(true);
        expect(
          await Bun.file(join(sharedCacheDir, "plugins", "plugin-two", "maui.json")).exists()
        ).toBe(false);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  });
});
