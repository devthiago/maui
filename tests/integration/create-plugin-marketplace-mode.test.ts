import { describe, it, expect } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";
import { scaffoldMarketplace, scaffoldPlugin } from "../../src/core/scaffold";

async function withTmpDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "maui-create-plugin-mm-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("scaffoldPlugin in marketplace mode", () => {
  it("creates plugins/<name>/ with no marketplace.json, gemini-extension.json, or maui.json inside it", async () => {
    await withTmpDir(async (root) => {
      const repoDir = join(root, "my-marketplace");
      await scaffoldMarketplace({ marketplaceName: "my-marketplace", githubUser: "example-user", targetDir: repoDir });

      const pluginDir = await scaffoldPlugin({
        pluginName: "plugin-one",
        githubUser: "example-user",
        description: "First plugin",
        cwd: repoDir,
      });

      expect(pluginDir).toBe(join(repoDir, "plugins", "plugin-one"));
      expect(await Bun.file(join(pluginDir, ".claude-plugin", "plugin.json")).exists()).toBe(true);
      expect(await Bun.file(join(pluginDir, ".codex-plugin", "plugin.json")).exists()).toBe(true);
      expect(await Bun.file(join(pluginDir, "skills", ".gitkeep")).exists()).toBe(true);
      expect(await Bun.file(join(pluginDir, "hooks", "opencode-hooks.ts")).exists()).toBe(true);
      const pkg = await Bun.file(join(pluginDir, "package.json")).json();
      expect(pkg.dependencies["@opencode-ai/plugin"]).toBeDefined();

      expect(await Bun.file(join(pluginDir, ".claude-plugin", "marketplace.json")).exists()).toBe(false);
      expect(await Bun.file(join(pluginDir, "gemini-extension.json")).exists()).toBe(false);
      expect(await Bun.file(join(pluginDir, "maui.json")).exists()).toBe(false);
    });
  });

  it("appends an entry to the root marketplace.json and .agents/plugins/marketplace.json", async () => {
    await withTmpDir(async (root) => {
      const repoDir = join(root, "my-marketplace");
      await scaffoldMarketplace({ marketplaceName: "my-marketplace", githubUser: "example-user", targetDir: repoDir });

      await scaffoldPlugin({
        pluginName: "plugin-one",
        githubUser: "example-user",
        description: "First plugin",
        cwd: repoDir,
      });

      const marketplace = await Bun.file(join(repoDir, ".claude-plugin", "marketplace.json")).json();
      expect(marketplace.plugins).toEqual([
        {
          name: "plugin-one",
          source: "./plugins/plugin-one",
          description: "First plugin",
          version: "0.1.0",
          author: { name: "example-user" },
        },
      ]);

      const agentsMarketplace = await Bun.file(
        join(repoDir, ".agents", "plugins", "marketplace.json")
      ).json();
      expect(agentsMarketplace.plugins).toEqual([
        { name: "plugin-one", source: "./plugins/plugin-one" },
      ]);
    });
  });

  it("a second, differently-named plugin doesn't disturb the first plugin's entry", async () => {
    await withTmpDir(async (root) => {
      const repoDir = join(root, "my-marketplace");
      await scaffoldMarketplace({ marketplaceName: "my-marketplace", githubUser: "example-user", targetDir: repoDir });

      await scaffoldPlugin({ pluginName: "plugin-one", githubUser: "example-user", cwd: repoDir });
      await scaffoldPlugin({ pluginName: "plugin-two", githubUser: "example-user", cwd: repoDir });

      const marketplace = await Bun.file(join(repoDir, ".claude-plugin", "marketplace.json")).json();
      const names = marketplace.plugins.map((p: { name: string }) => p.name).sort();
      expect(names).toEqual(["plugin-one", "plugin-two"]);

      expect(await Bun.file(join(repoDir, "plugins", "plugin-one", ".claude-plugin", "plugin.json")).exists()).toBe(true);
      expect(await Bun.file(join(repoDir, "plugins", "plugin-two", ".claude-plugin", "plugin.json")).exists()).toBe(true);
    });
  });

  it("re-running with the same plugin name updates the entry in place, not a duplicate", async () => {
    await withTmpDir(async (root) => {
      const repoDir = join(root, "my-marketplace");
      await scaffoldMarketplace({ marketplaceName: "my-marketplace", githubUser: "example-user", targetDir: repoDir });

      await scaffoldPlugin({ pluginName: "plugin-one", githubUser: "example-user", description: "v1", cwd: repoDir });
      await scaffoldPlugin({ pluginName: "plugin-one", githubUser: "example-user", description: "v2", cwd: repoDir });

      const marketplace = await Bun.file(join(repoDir, ".claude-plugin", "marketplace.json")).json();
      expect(marketplace.plugins).toHaveLength(1);
      expect(marketplace.plugins[0].description).toBe("v2");
    });
  });

  it("the per-plugin version:bump script updates its own files and its marketplace.json entry, not the marketplace's own metadata.version", async () => {
    await withTmpDir(async (root) => {
      const repoDir = join(root, "my-marketplace");
      await scaffoldMarketplace({ marketplaceName: "my-marketplace", githubUser: "example-user", targetDir: repoDir });

      const pluginDir = await scaffoldPlugin({
        pluginName: "plugin-one",
        githubUser: "example-user",
        cwd: repoDir,
      });

      await $`bun run ${join(pluginDir, "scripts", "bump-version.ts")} 0.5.0`.cwd(pluginDir).quiet();

      const pkg = await Bun.file(join(pluginDir, "package.json")).json();
      expect(pkg.version).toBe("0.5.0");
      const pluginJson = await Bun.file(join(pluginDir, ".claude-plugin", "plugin.json")).json();
      expect(pluginJson.version).toBe("0.5.0");
      const codexJson = await Bun.file(join(pluginDir, ".codex-plugin", "plugin.json")).json();
      expect(codexJson.version).toBe("0.5.0");

      const marketplace = await Bun.file(join(repoDir, ".claude-plugin", "marketplace.json")).json();
      expect(marketplace.plugins[0].version).toBe("0.5.0");
      expect(marketplace.metadata.version).toBe("0.1.0");
    });
  });
});

describe("scaffoldPlugin standalone mode (regression guard)", () => {
  it("still produces the original single-plugin scaffold when no marketplace.json exists in cwd", async () => {
    await withTmpDir(async (root) => {
      const targetDir = join(root, "standalone-plugin");
      await scaffoldPlugin({
        pluginName: "standalone-plugin",
        githubUser: "example-user",
        targetDir,
        cwd: root,
      });

      expect(await Bun.file(join(targetDir, ".claude-plugin", "marketplace.json")).exists()).toBe(true);
      expect(await Bun.file(join(targetDir, "gemini-extension.json")).exists()).toBe(true);
      expect(await Bun.file(join(targetDir, "maui.json")).exists()).toBe(true);
    });
  });
});
