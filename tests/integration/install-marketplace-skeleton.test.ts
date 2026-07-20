import { describe, it, expect } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installPlugin, installMarketplace, installFromSource } from "../../src/cli/install";
import { readRegistry } from "../../src/core/registry";
import { MarketplaceModeMismatchError } from "../../src/core/errors";
import { run } from "../../src/cli/index";

async function withTmpHome(fn: (home: string) => Promise<void>): Promise<void> {
  const home = await mkdtemp(join(tmpdir(), "maui-install-marketplace-home-"));
  try {
    await fn(home);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

async function makeFixtureMarketplace(marketplaceName: string, pluginNames: string[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "maui-fixture-marketplace-"));
  await mkdir(join(dir, ".claude-plugin"), { recursive: true });
  await writeFile(
    join(dir, ".claude-plugin", "marketplace.json"),
    JSON.stringify({
      name: marketplaceName,
      owner: { name: "example-user" },
      plugins: pluginNames.map((name) => ({
        name,
        source: `./plugins/${name}`,
        description: `does ${name}`,
      })),
    })
  );
  for (const name of pluginNames) {
    await mkdir(join(dir, "plugins", name, "skills", `${name}-skill`), { recursive: true });
    await mkdir(join(dir, "plugins", name, "rules"), { recursive: true });
    await writeFile(
      join(dir, "plugins", name, "maui.json"),
      JSON.stringify({
        name,
        version: "1.0.0",
        targets: {
          kiro: { "rules/": ".kiro/steering/" },
          _default: { "skills/": "skills/" },
        },
      })
    );
    await writeFile(
      join(dir, "plugins", name, "skills", `${name}-skill`, "SKILL.md"),
      `# ${name}\n`
    );
    await writeFile(join(dir, "plugins", name, "rules", `${name}.md`), `# ${name} rule\n`);
  }
  return dir;
}

describe("installMarketplace", () => {
  it("installs selected plugins into 2 independent registry entries sharing one sourceRepo", async () => {
    await withTmpHome(async (home) => {
      await mkdir(join(home, ".kiro"), { recursive: true });
      const source = await makeFixtureMarketplace("my-toolkit", ["plugin-one", "plugin-two"]);
      try {
        const results = await installMarketplace(source, { home, allPlugins: true });
        expect(results.length).toBe(2);

        const registry = await readRegistry(home);
        const one = registry.plugins["plugin-one"];
        const two = registry.plugins["plugin-two"];
        expect(one).toBeDefined();
        expect(two).toBeDefined();
        expect(one!.sourceRepo).toBeDefined();
        expect(one!.sourceRepo).toBe(two!.sourceRepo);
        expect(one!.pluginPath).toBe("plugins/plugin-one");
        expect(two!.pluginPath).toBe("plugins/plugin-two");

        expect(
          await Bun.file(join(home, ".agents", "skills", "plugin-one-skill", "SKILL.md")).exists()
        ).toBe(true);
        expect(
          await Bun.file(join(home, ".agents", "skills", "plugin-two-skill", "SKILL.md")).exists()
        ).toBe(true);
        expect(
          await Bun.file(join(home, ".kiro", "steering", "plugin-one.md")).exists()
        ).toBe(true);
        expect(
          await Bun.file(join(home, ".kiro", "steering", "plugin-two.md")).exists()
        ).toBe(true);
      } finally {
        await rm(source, { recursive: true, force: true });
      }
    });
  });

  it("--plugin selects only the named plugin", async () => {
    await withTmpHome(async (home) => {
      const source = await makeFixtureMarketplace("my-toolkit", ["plugin-one", "plugin-two"]);
      try {
        const results = await installMarketplace(source, { home, pluginFlags: ["plugin-one"] });
        expect(results.length).toBe(1);
        expect(results[0]!.pluginName).toBe("plugin-one");

        const registry = await readRegistry(home);
        expect(registry.plugins["plugin-one"]).toBeDefined();
        expect(registry.plugins["plugin-two"]).toBeUndefined();
      } finally {
        await rm(source, { recursive: true, force: true });
      }
    });
  });

  it("throws MarketplaceModeMismatchError when given a single-plugin source", async () => {
    await withTmpHome(async (home) => {
      const dir = await mkdtemp(join(tmpdir(), "maui-single-plugin-"));
      await writeFile(
        join(dir, "maui.json"),
        JSON.stringify({ name: "solo-plugin", version: "1.0.0", targets: {} })
      );
      try {
        await expect(installMarketplace(dir, { home })).rejects.toThrow(MarketplaceModeMismatchError);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  });
});

describe("installPlugin (regression)", () => {
  it("throws MarketplaceModeMismatchError when given a multi-plugin marketplace source", async () => {
    await withTmpHome(async (home) => {
      const source = await makeFixtureMarketplace("my-toolkit", ["plugin-one"]);
      try {
        await expect(installPlugin(source, { home })).rejects.toThrow(MarketplaceModeMismatchError);
      } finally {
        await rm(source, { recursive: true, force: true });
      }
    });
  });
});

describe("installFromSource", () => {
  it("dispatches a single-plugin source to installPlugin's behavior, returning a 1-element array", async () => {
    await withTmpHome(async (home) => {
      const dir = await mkdtemp(join(tmpdir(), "maui-single-plugin-fromsource-"));
      await mkdir(join(dir, "skills", "example"), { recursive: true });
      await writeFile(
        join(dir, "maui.json"),
        JSON.stringify({ name: "solo-plugin", version: "1.0.0", targets: { _default: { "skills/": "skills/" } } })
      );
      await writeFile(join(dir, "skills", "example", "SKILL.md"), "# Example\n");
      try {
        const results = await installFromSource(dir, { home });
        expect(results.length).toBe(1);
        expect(results[0]!.pluginName).toBe("solo-plugin");
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  });

  it("dispatches a marketplace source through selection, returning one result per selected plugin", async () => {
    await withTmpHome(async (home) => {
      const source = await makeFixtureMarketplace("my-toolkit", ["plugin-one", "plugin-two"]);
      try {
        const results = await installFromSource(source, { home, allPlugins: true });
        expect(results.map((r) => r.pluginName).sort()).toEqual(["plugin-one", "plugin-two"]);
      } finally {
        await rm(source, { recursive: true, force: true });
      }
    });
  });
});

describe("maui install CLI wiring", () => {
  async function withFixtureHomeEnv(home: string, fn: () => Promise<void>): Promise<void> {
    const originalHome = process.env.HOME;
    process.env.HOME = home;
    try {
      await fn();
    } finally {
      process.env.HOME = originalHome;
    }
  }

  it("--all-plugins installs every catalogued plugin and prints one summary block per plugin", async () => {
    await withTmpHome(async (home) => {
      const source = await makeFixtureMarketplace("my-toolkit", ["plugin-one", "plugin-two"]);
      try {
        await withFixtureHomeEnv(home, async () => {
          const result = await run(["install", source, "--all-plugins"]);

          expect(result.code).toBe(0);
          expect(result.stdout).toContain("Installed plugin-one");
          expect(result.stdout).toContain("Installed plugin-two");
        });
      } finally {
        await rm(source, { recursive: true, force: true });
      }
    });
  });

  it("--plugin installs only the named plugin", async () => {
    await withTmpHome(async (home) => {
      const source = await makeFixtureMarketplace("my-toolkit", ["plugin-one", "plugin-two"]);
      try {
        await withFixtureHomeEnv(home, async () => {
          const result = await run(["install", source, "--plugin", "plugin-one"]);

          expect(result.code).toBe(0);
          expect(result.stdout).toContain("Installed plugin-one");
          expect(result.stdout).not.toContain("Installed plugin-two");
        });
      } finally {
        await rm(source, { recursive: true, force: true });
      }
    });
  });

  it("no --plugin/--all-plugins and no TTY (the test environment) errors non-zero listing catalog names", async () => {
    await withTmpHome(async (home) => {
      const source = await makeFixtureMarketplace("my-toolkit", ["plugin-one", "plugin-two"]);
      try {
        await withFixtureHomeEnv(home, async () => {
          const result = await run(["install", source]);

          expect(result.code).toBe(1);
          expect(result.stderr).toContain("plugin-one");
          expect(result.stderr).toContain("plugin-two");
        });
      } finally {
        await rm(source, { recursive: true, force: true });
      }
    });
  });
});
