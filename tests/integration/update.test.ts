import { describe, it, expect } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installPlugin } from "../../src/cli/install";
import { updatePlugin } from "../../src/cli/update";
import { PluginNotFoundError } from "../../src/core/errors";
import { readRegistry, writeRegistry } from "../../src/core/registry";

async function withTmpHome(fn: (home: string) => Promise<void>): Promise<void> {
  const home = await mkdtemp(join(tmpdir(), "maui-update-home-"));
  try {
    await fn(home);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

async function makeFixturePlugin(name: string, skillBody: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "maui-update-plugin-"));
  await writeFile(
    join(dir, "maui.json"),
    JSON.stringify({ name, version: "1.0.0", targets: { _default: { "skills/": "skills/" } } })
  );
  await mkdir(join(dir, "skills", "example"), { recursive: true });
  await writeFile(join(dir, "skills", "example", "SKILL.md"), skillBody);
  return dir;
}

describe("updatePlugin", () => {
  it("throws PluginNotFoundError for a plugin that isn't installed", async () => {
    await withTmpHome(async (home) => {
      await expect(updatePlugin("nonexistent", { home })).rejects.toThrow(PluginNotFoundError);
    });
  });

  it("re-fetches a symlink-cached plugin so existing symlinks resolve to updated content", async () => {
    await withTmpHome(async (home) => {
      const source = await makeFixturePlugin("example-plugin", "# v1\n");
      try {
        await installPlugin(source, { home });
        const linkedPath = join(home, ".agents", "skills", "example", "SKILL.md");
        expect(await Bun.file(linkedPath).text()).toBe("# v1\n");

        await writeFile(join(source, "skills", "example", "SKILL.md"), "# v2\n");
        const result = await updatePlugin("example-plugin", { home });

        expect(result.refreshed).toBe(true);
        expect(await Bun.file(linkedPath).text()).toBe("# v2\n");
      } finally {
        await rm(source, { recursive: true, force: true });
      }
    });
  });

  it("does not touch the cache and reports a hint for native-marketplace-only plugins", async () => {
    await withTmpHome(async (home) => {
      const registry = await readRegistry(home);
      registry.plugins["native-only-plugin"] = {
        name: "native-only-plugin",
        source: "https://github.com/example/native-only-plugin",
        version: "1.0.0",
        installedAt: new Date().toISOString(),
        agents: [
          {
            agent: "claude-code",
            scope: "global",
            kind: "native-marketplace",
            identity: {
              pluginName: "native-only-plugin",
              repo: "example/native-only-plugin",
              marketplaceName: "native-only-plugin",
            },
          },
        ],
      };
      await writeRegistry(registry, home);

      const result = await updatePlugin("native-only-plugin", { home });

      expect(result.refreshed).toBe(false);
      expect(result.nativeAgentHints.some((hint) => hint.startsWith("claude-code"))).toBe(true);
    });
  });
});
