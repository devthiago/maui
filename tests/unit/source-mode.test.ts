import { describe, it, expect } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectSourceMode, MarketplaceCatalogError } from "../../src/core/source-mode";

async function withTmpDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "maui-source-mode-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await Bun.write(path, JSON.stringify(value, null, 2));
}

describe("detectSourceMode", () => {
  it("returns single mode when a root maui.json exists, no marketplace.json at all", async () => {
    await withTmpDir(async (dir) => {
      await writeJson(join(dir, "maui.json"), { name: "example-plugin", version: "1.0.0", targets: {} });

      expect(await detectSourceMode(dir)).toEqual({ mode: "single" });
    });
  });

  it("returns single mode when root maui.json exists alongside a self-hosted marketplace.json", async () => {
    await withTmpDir(async (dir) => {
      await writeJson(join(dir, "maui.json"), { name: "example-plugin", version: "1.0.0", targets: {} });
      await mkdir(join(dir, ".claude-plugin"), { recursive: true });
      await writeJson(join(dir, ".claude-plugin", "marketplace.json"), {
        name: "example-plugin",
        owner: { name: "example-user" },
        plugins: [{ name: "example-plugin", source: ".", description: "" }],
      });

      expect(await detectSourceMode(dir)).toEqual({ mode: "single" });
    });
  });

  it("returns marketplace mode with a parsed catalog when no maui.json exists but marketplace.json catalogs subfolders", async () => {
    await withTmpDir(async (dir) => {
      await mkdir(join(dir, ".claude-plugin"), { recursive: true });
      await writeJson(join(dir, ".claude-plugin", "marketplace.json"), {
        name: "my-toolkit",
        owner: { name: "example-user" },
        plugins: [
          { name: "plugin-one", source: "./plugins/plugin-one", description: "does thing one" },
          { name: "plugin-two", source: "./plugins/plugin-two", description: "does thing two" },
        ],
      });

      expect(await detectSourceMode(dir)).toEqual({
        mode: "marketplace",
        marketplaceName: "my-toolkit",
        catalog: [
          { name: "plugin-one", description: "does thing one", pluginPath: "plugins/plugin-one" },
          { name: "plugin-two", description: "does thing two", pluginPath: "plugins/plugin-two" },
        ],
      });
    });
  });

  it("returns none when neither maui.json nor marketplace.json exist", async () => {
    await withTmpDir(async (dir) => {
      expect(await detectSourceMode(dir)).toEqual({ mode: "none" });
    });
  });

  it("returns none when marketplace.json exists but has no subfolder-style entries", async () => {
    await withTmpDir(async (dir) => {
      await mkdir(join(dir, ".claude-plugin"), { recursive: true });
      await writeJson(join(dir, ".claude-plugin", "marketplace.json"), {
        name: "my-toolkit",
        plugins: [],
      });

      expect(await detectSourceMode(dir)).toEqual({ mode: "none" });
    });
  });

  it("throws MarketplaceCatalogError on invalid JSON", async () => {
    await withTmpDir(async (dir) => {
      await mkdir(join(dir, ".claude-plugin"), { recursive: true });
      await Bun.write(join(dir, ".claude-plugin", "marketplace.json"), "{ not json");

      await expect(detectSourceMode(dir)).rejects.toThrow(MarketplaceCatalogError);
    });
  });

  it("throws MarketplaceCatalogError when the plugins array is missing", async () => {
    await withTmpDir(async (dir) => {
      await mkdir(join(dir, ".claude-plugin"), { recursive: true });
      await writeJson(join(dir, ".claude-plugin", "marketplace.json"), { name: "my-toolkit" });

      await expect(detectSourceMode(dir)).rejects.toThrow(MarketplaceCatalogError);
    });
  });
});
