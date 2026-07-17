import { describe, it, expect } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";
import { scaffoldMarketplace } from "../../src/core/scaffold";

async function withTmpDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "maui-marketplace-scaffold-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("scaffoldMarketplace", () => {
  it("produces the repo-shell layout from SPEC.md", async () => {
    await withTmpDir(async (root) => {
      const targetDir = join(root, "my-marketplace");
      await scaffoldMarketplace({
        marketplaceName: "my-marketplace",
        githubUser: "example-user",
        description: "An example marketplace",
        targetDir,
      });

      const marketplace = await Bun.file(join(targetDir, ".claude-plugin", "marketplace.json")).json();
      expect(marketplace.name).toBe("my-marketplace");
      expect(marketplace.owner).toEqual({ name: "example-user" });
      expect(marketplace.metadata).toEqual({ description: "An example marketplace", version: "0.1.0" });
      expect(marketplace.plugins).toEqual([]);

      const agentsMarketplace = await Bun.file(
        join(targetDir, ".agents", "plugins", "marketplace.json")
      ).json();
      expect(agentsMarketplace.name).toBe("my-marketplace");
      expect(agentsMarketplace.plugins).toEqual([]);

      const gemini = await Bun.file(join(targetDir, "gemini-extension.json")).json();
      expect(gemini).toEqual({
        name: "my-marketplace",
        version: "0.1.0",
        description: "An example marketplace",
        contextFileName: "AGENTS.md",
      });

      expect(await Bun.file(join(targetDir, "plugins", ".gitkeep")).exists()).toBe(true);

      const pkg = await Bun.file(join(targetDir, "package.json")).json();
      expect(pkg.scripts["version:bump"]).toBeDefined();

      expect(await Bun.file(join(targetDir, "scripts", "bump-version.ts")).exists()).toBe(true);
    });
  });

  it("initializes git with no remote and no commits", async () => {
    await withTmpDir(async (root) => {
      const targetDir = join(root, "my-marketplace");
      await scaffoldMarketplace({ marketplaceName: "my-marketplace", githubUser: "example-user", targetDir });

      expect(await Bun.file(join(targetDir, ".git", "HEAD")).exists()).toBe(true);
      const remotes = await $`git -C ${targetDir} remote`.quiet().text();
      expect(remotes.trim()).toBe("");
    });
  });

  it("version:bump updates package.json, marketplace.json's metadata.version, and gemini-extension.json, skipping .agents/plugins/marketplace.json gracefully", async () => {
    await withTmpDir(async (root) => {
      const targetDir = join(root, "my-marketplace");
      await scaffoldMarketplace({ marketplaceName: "my-marketplace", githubUser: "example-user", targetDir });

      await $`bun run ${join(targetDir, "scripts", "bump-version.ts")} 0.2.0`.cwd(targetDir).quiet();

      const pkg = await Bun.file(join(targetDir, "package.json")).json();
      expect(pkg.version).toBe("0.2.0");

      const marketplace = await Bun.file(join(targetDir, ".claude-plugin", "marketplace.json")).json();
      expect(marketplace.metadata.version).toBe("0.2.0");

      const gemini = await Bun.file(join(targetDir, "gemini-extension.json")).json();
      expect(gemini.version).toBe("0.2.0");

      // .agents/plugins/marketplace.json has no version key by default — must stay valid JSON, no crash.
      const agentsMarketplace = await Bun.file(
        join(targetDir, ".agents", "plugins", "marketplace.json")
      ).json();
      expect(agentsMarketplace.name).toBe("my-marketplace");
      expect("version" in agentsMarketplace).toBe(false);
    });
  });
});
