import { describe, it, expect } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";
import { scaffoldPlugin } from "../../src/core/scaffold";

async function withTmpDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "maui-scaffold-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("scaffoldPlugin", () => {
  it("produces the full folder/file layout from SPEC.md", async () => {
    await withTmpDir(async (root) => {
      const targetDir = join(root, "my-plugin");
      await scaffoldPlugin({
        pluginName: "my-plugin",
        githubUser: "example-user",
        description: "An example plugin",
        targetDir,
      });

      for (const folder of ["skills", "agents", "commands", "rules", "prompts"]) {
        expect(await Bun.file(join(targetDir, folder, ".gitkeep")).exists()).toBe(true);
      }

      expect(await Bun.file(join(targetDir, ".claude-plugin", "plugin.json")).exists()).toBe(true);
      expect(
        await Bun.file(join(targetDir, ".claude-plugin", "marketplace.json")).exists()
      ).toBe(true);
      expect(await Bun.file(join(targetDir, ".codex-plugin", "plugin.json")).exists()).toBe(true);
      expect(await Bun.file(join(targetDir, "gemini-extension.json")).exists()).toBe(true);
      expect(await Bun.file(join(targetDir, "maui.json")).exists()).toBe(true);
      expect(await Bun.file(join(targetDir, "package.json")).exists()).toBe(true);
      expect(await Bun.file(join(targetDir, "scripts", "bump-version.ts")).exists()).toBe(true);

      const pkg = await Bun.file(join(targetDir, "package.json")).json();
      expect(pkg.scripts["version:bump"]).toBeDefined();

      const marketplace = await Bun.file(join(targetDir, ".claude-plugin", "marketplace.json")).json();
      expect(marketplace.plugins[0].source).toBe(".");
      expect(marketplace.owner).toEqual({ name: "example-user" });

      const maui = await Bun.file(join(targetDir, "maui.json")).json();
      expect(maui.targets["claude-code"]).toEqual({
        marketplace: true,
        repo: "example-user/my-plugin",
        marketplaceName: "my-plugin",
      });
      expect(maui.targets._default).toEqual({
        "skills/": "skills/",
        "commands/": "commands/",
        "agents/": "agents/",
      });
      expect(maui.targets.opencode).toEqual({
        "skills/": "skills/",
        "commands/": "commands/",
        "agents/": "agents/",
      });
      expect(maui.targets.kimi).toEqual({
        "skills/": "skills/",
        "agents/": "agents/",
        "commands/": "skills/",
      });
    });
  });

  it("scaffolds an empty hooks/hooks.json, the shared default hooks path for Claude Code and Codex", async () => {
    await withTmpDir(async (root) => {
      const targetDir = join(root, "my-plugin");
      await scaffoldPlugin({ pluginName: "my-plugin", githubUser: "example-user", targetDir });

      const hooksJson = await Bun.file(join(targetDir, "hooks", "hooks.json")).json();
      expect(hooksJson).toEqual({ hooks: {} });
    });
  });

  it("scaffolds hooks/opencode-hooks.ts with a working TypeScript-Support example and a docs docblock", async () => {
    await withTmpDir(async (root) => {
      const targetDir = join(root, "my-plugin");
      await scaffoldPlugin({ pluginName: "my-plugin", githubUser: "example-user", targetDir });

      const hooksFile = Bun.file(join(targetDir, "hooks", "opencode-hooks.ts"));
      expect(await hooksFile.exists()).toBe(true);
      expect(await Bun.file(join(targetDir, "hooks", ".gitkeep")).exists()).toBe(false);

      const content = await hooksFile.text();
      expect(content).toContain("https://opencode.ai/docs/plugins/#create-a-plugin");
      expect(content).toContain('import type { Plugin } from "@opencode-ai/plugin"');
      expect(content).toContain("export const MyPlugin: Plugin = async (");
    });
  });

  it("adds @opencode-ai/plugin as a package.json dependency", async () => {
    await withTmpDir(async (root) => {
      const targetDir = join(root, "my-plugin");
      await scaffoldPlugin({ pluginName: "my-plugin", githubUser: "example-user", targetDir });

      const pkg = await Bun.file(join(targetDir, "package.json")).json();
      expect(pkg.dependencies["@opencode-ai/plugin"]).toBeDefined();
    });
  });

  it("adds typecheck devDependencies and a root tsconfig.json", async () => {
    await withTmpDir(async (root) => {
      const targetDir = join(root, "my-plugin");
      await scaffoldPlugin({ pluginName: "my-plugin", githubUser: "example-user", targetDir });

      const pkg = await Bun.file(join(targetDir, "package.json")).json();
      expect(pkg.devDependencies).toEqual({
        "@types/bun": "^1.3.14",
        "@types/node": "^26.1.1",
        typescript: "^7.0.2",
      });

      const tsconfig = await Bun.file(join(targetDir, "tsconfig.json")).json();
      expect(tsconfig.compilerOptions.strict).toBe(true);
      expect(tsconfig.compilerOptions.jsx).toBe("react-jsx");
      expect(tsconfig.include).toBeUndefined();
    });
  });

  it("initializes git with no remote and no commits", async () => {
    await withTmpDir(async (root) => {
      const targetDir = join(root, "my-plugin");
      await scaffoldPlugin({ pluginName: "my-plugin", githubUser: "example-user", targetDir });

      expect(await Bun.file(join(targetDir, ".git", "HEAD")).exists()).toBe(true);

      const remotes = await $`git -C ${targetDir} remote`.quiet().text();
      expect(remotes.trim()).toBe("");

      const log = await $`git -C ${targetDir} log --oneline`.quiet().nothrow();
      expect(log.exitCode).not.toBe(0);
    });
  });

  it("version:bump updates the version consistently across every generated manifest", async () => {
    await withTmpDir(async (root) => {
      const targetDir = join(root, "my-plugin");
      await scaffoldPlugin({ pluginName: "my-plugin", githubUser: "example-user", targetDir });

      await $`bun run ${join(targetDir, "scripts", "bump-version.ts")} 0.2.0`.cwd(targetDir).quiet();

      for (const file of [
        "package.json",
        ".claude-plugin/plugin.json",
        ".codex-plugin/plugin.json",
        "gemini-extension.json",
        "maui.json",
      ]) {
        const json = await Bun.file(join(targetDir, file)).json();
        expect(json.version).toBe("0.2.0");
      }
    });
  });
});
