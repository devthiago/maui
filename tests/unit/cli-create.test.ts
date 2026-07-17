import { describe, it, expect } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPlugin, createMarketplace, create } from "../../src/cli/create";

async function withTmpDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "maui-cli-create-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("createPlugin", () => {
  it("gathers answers via the injected prompt and scaffolds the plugin", async () => {
    await withTmpDir(async (root) => {
      const targetDir = join(root, "my-plugin");
      const answers = ["my-plugin", "example-user", "An example plugin", "MIT"];
      let index = 0;
      const prompt = async () => answers[index++] ?? "";

      await createPlugin("my-plugin", { prompt, targetDir });

      const pkg = await Bun.file(join(targetDir, "package.json")).json();
      expect(pkg.name).toBe("my-plugin");
      expect(pkg.license).toBe("MIT");

      const manifest = await Bun.file(join(targetDir, "maui.json")).json();
      expect(manifest.targets["claude-code"].repo).toBe("example-user/my-plugin");
    });
  });
});

describe("createMarketplace", () => {
  it("gathers answers via the injected prompt and scaffolds the marketplace shell", async () => {
    await withTmpDir(async (root) => {
      const targetDir = join(root, "my-marketplace");
      const answers = ["my-marketplace", "example-user", "An example marketplace", "MIT"];
      let index = 0;
      const prompt = async () => answers[index++] ?? "";

      await createMarketplace("my-marketplace", { prompt, targetDir });

      const marketplace = await Bun.file(join(targetDir, ".claude-plugin", "marketplace.json")).json();
      expect(marketplace.name).toBe("my-marketplace");
      expect(marketplace.owner).toEqual({ name: "example-user" });
      expect(marketplace.plugins).toEqual([]);
      expect(await Bun.file(join(targetDir, "gemini-extension.json")).exists()).toBe(true);
    });
  });
});

describe("create dispatcher", () => {
  it("delegates to createPlugin (standalone) when the user answers 'single'", async () => {
    await withTmpDir(async (root) => {
      const targetDir = join(root, "my-plugin");
      const answers = ["single", "my-plugin", "example-user", "", ""];
      let index = 0;
      const prompt = async () => answers[index++] ?? "";

      await create("my-plugin", { prompt, targetDir });

      expect(await Bun.file(join(targetDir, "maui.json")).exists()).toBe(true);
    });
  });

  it("delegates to createMarketplace when the user answers 'multi'", async () => {
    await withTmpDir(async (root) => {
      const targetDir = join(root, "my-marketplace");
      const answers = ["multi", "my-marketplace", "example-user", "", ""];
      let index = 0;
      const prompt = async () => answers[index++] ?? "";

      await create("my-marketplace", { prompt, targetDir });

      expect(await Bun.file(join(targetDir, ".claude-plugin", "marketplace.json")).exists()).toBe(true);
      expect(await Bun.file(join(targetDir, "maui.json")).exists()).toBe(false);
    });
  });
});
