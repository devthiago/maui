import { describe, it, expect } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir, chmod, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { grokAdapter } from "../../src/adapters/grok";
import { installMarketplace, installPlugin } from "../../src/cli/install";

async function withFakeGrok(fn: (logPath: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "maui-fake-grok-marketplace-"));
  const logPath = join(dir, "invocations.log");
  const scriptPath = join(dir, "grok");
  await writeFile(scriptPath, `#!/bin/sh\necho "$@" >> "${logPath}"\nexit 0\n`);
  await chmod(scriptPath, 0o755);

  const originalPath = process.env.PATH;
  process.env.PATH = `${dir}:${originalPath}`;
  try {
    await fn(logPath);
  } finally {
    process.env.PATH = originalPath;
    await rm(dir, { recursive: true, force: true });
  }
}

async function withTmpHome(fn: (home: string) => Promise<void>): Promise<void> {
  const home = await mkdtemp(join(tmpdir(), "maui-grok-marketplace-home-"));
  try {
    await fn(home);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

describe("grokAdapter sourceMode branching", () => {
  it("install(): sourceMode 'marketplace' uses marketplace add + install-by-name, not the direct-git path", async () => {
    await withFakeGrok(async (logPath) => {
      await grokAdapter.install(
        { pluginName: "plugin-one", repo: "example-user/my-toolkit", marketplaceName: "my-toolkit" },
        { sourceMode: "marketplace" }
      );

      const log = await readFile(logPath, "utf-8");
      expect(log.trim().split("\n")).toEqual([
        "plugin marketplace add https://github.com/example-user/my-toolkit",
        "plugin install plugin-one@my-toolkit",
      ]);
    });
  });

  it("install(): no sourceMode (or 'single') keeps today's direct-git path unchanged", async () => {
    await withFakeGrok(async (logPath) => {
      await grokAdapter.install({
        pluginName: "example-plugin",
        repo: "example-user/example-plugin",
        marketplaceName: "example-plugin",
      });

      const log = await readFile(logPath, "utf-8");
      expect(log.trim()).toBe(
        "plugin install git+https://github.com/example-user/example-plugin --trust"
      );
    });
  });

  it("remove(): sourceMode 'marketplace' uninstalls with the <name>@<marketplace> qualifier", async () => {
    await withFakeGrok(async (logPath) => {
      await grokAdapter.remove(
        { pluginName: "plugin-one", repo: "example-user/my-toolkit", marketplaceName: "my-toolkit" },
        { sourceMode: "marketplace" }
      );

      const log = await readFile(logPath, "utf-8");
      expect(log.trim()).toBe("plugin uninstall plugin-one@my-toolkit");
    });
  });

  it("remove(): no sourceMode keeps today's plain-name uninstall unchanged", async () => {
    await withFakeGrok(async (logPath) => {
      await grokAdapter.remove({
        pluginName: "example-plugin",
        repo: "example-user/example-plugin",
        marketplaceName: "example-plugin",
      });

      const log = await readFile(logPath, "utf-8");
      expect(log.trim()).toBe("plugin uninstall example-plugin");
    });
  });
});

describe("installMarketplace/installPlugin threading sourceMode into Grok", () => {
  async function makeFixtureMarketplace(marketplaceName: string, pluginNames: string[]): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "maui-grok-fixture-marketplace-"));
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
      await mkdir(join(dir, "plugins", name), { recursive: true });
      await writeFile(
        join(dir, "plugins", name, "maui.json"),
        JSON.stringify({
          name,
          version: "1.0.0",
          targets: {
            grok: { marketplace: true, repo: `example-user/${marketplaceName}`, marketplaceName },
          },
        })
      );
    }
    return dir;
  }

  it("a marketplace-mode source uses Grok's marketplace path, once add per selection + one install per selection", async () => {
    await withFakeGrok(async (logPath) => {
      await withTmpHome(async (home) => {
        const source = await makeFixtureMarketplace("my-toolkit", ["plugin-one", "plugin-two"]);
        try {
          await installMarketplace(source, { home, allPlugins: true });

          const log = await readFile(logPath, "utf-8");
          const lines = log.trim().split("\n");
          expect(lines).toContain("plugin install plugin-one@my-toolkit");
          expect(lines).toContain("plugin install plugin-two@my-toolkit");
          expect(lines.every((line) => !line.startsWith("plugin install git+"))).toBe(true);
        } finally {
          await rm(source, { recursive: true, force: true });
        }
      });
    });
  });

  it("a single-plugin source still uses the direct-git path (regression)", async () => {
    await withFakeGrok(async (logPath) => {
      await withTmpHome(async (home) => {
        const dir = await mkdtemp(join(tmpdir(), "maui-grok-single-plugin-"));
        await writeFile(
          join(dir, "maui.json"),
          JSON.stringify({
            name: "solo-plugin",
            version: "1.0.0",
            targets: { grok: { marketplace: true, repo: "example-user/solo-plugin" } },
          })
        );
        try {
          await installPlugin(dir, { home });

          const log = await readFile(logPath, "utf-8");
          expect(log.trim()).toBe(
            "plugin install git+https://github.com/example-user/solo-plugin --trust"
          );
        } finally {
          await rm(dir, { recursive: true, force: true });
        }
      });
    });
  });
});
