import { describe, it, expect } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir as mkdirNode, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";
import { fetchPlugin, fetchSource, pluginsRoot } from "../../src/core/fetch";

async function withTmpHome(fn: (home: string) => Promise<void>): Promise<void> {
  const home = await mkdtemp(join(tmpdir(), "maui-fetch-home-"));
  try {
    await fn(home);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

async function makeFixturePlugin(name: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "maui-fixture-plugin-"));
  await writeFile(
    join(dir, "maui.json"),
    JSON.stringify({ name, version: "1.0.0", targets: { _default: { "skills/": "skills/" } } })
  );
  await mkdirNode(join(dir, "skills", "example"), { recursive: true });
  await writeFile(join(dir, "skills", "example", "SKILL.md"), "# Example\n");
  return dir;
}

describe("fetchPlugin", () => {
  it("populates ~/.maui/plugins/<name> from a local path source", async () => {
    await withTmpHome(async (home) => {
      const source = await makeFixturePlugin("local-plugin");
      try {
        const targetDir = await fetchPlugin(source, home);

        expect(targetDir).toBe(join(pluginsRoot(home), "local-plugin"));
        expect(await Bun.file(join(targetDir, "maui.json")).exists()).toBe(true);
        expect(await Bun.file(join(targetDir, "skills", "example", "SKILL.md")).exists()).toBe(true);
      } finally {
        await rm(source, { recursive: true, force: true });
      }
    });
  });

  it("is idempotent: fetching the same local plugin twice doesn't duplicate or error", async () => {
    await withTmpHome(async (home) => {
      const source = await makeFixturePlugin("idempotent-plugin");
      try {
        await fetchPlugin(source, home);
        const targetDir = await fetchPlugin(source, home);

        expect(targetDir).toBe(join(pluginsRoot(home), "idempotent-plugin"));
        expect(await Bun.file(join(targetDir, "maui.json")).exists()).toBe(true);
      } finally {
        await rm(source, { recursive: true, force: true });
      }
    });
  });

  it("populates the cache from a git source", async () => {
    await withTmpHome(async (home) => {
      const sourceContent = await makeFixturePlugin("git-plugin");
      const gitRepo = await mkdtemp(join(tmpdir(), "maui-fixture-git-"));
      try {
        await cp(sourceContent, gitRepo, { recursive: true });
        await $`git -C ${gitRepo} init -q`.quiet();
        await $`git -C ${gitRepo} -c user.email=test@example.com -c user.name=Test add -A`.quiet();
        await $`git -C ${gitRepo} -c user.email=test@example.com -c user.name=Test commit -q -m init`.quiet();

        const targetDir = await fetchPlugin(`file://${gitRepo}`, home);

        expect(targetDir).toBe(join(pluginsRoot(home), "git-plugin"));
        expect(await Bun.file(join(targetDir, "maui.json")).exists()).toBe(true);
      } finally {
        await rm(sourceContent, { recursive: true, force: true });
        await rm(gitRepo, { recursive: true, force: true });
      }
    });
  });
});

async function makeFixtureMarketplace(marketplaceName: string, pluginNames: string[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "maui-fixture-marketplace-"));
  await mkdirNode(join(dir, ".claude-plugin"), { recursive: true });
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
    await mkdirNode(join(dir, "plugins", name, "skills", "example"), { recursive: true });
    await writeFile(
      join(dir, "plugins", name, "maui.json"),
      JSON.stringify({ name, version: "1.0.0", targets: { _default: { "skills/": "skills/" } } })
    );
    await writeFile(join(dir, "plugins", name, "skills", "example", "SKILL.md"), `# ${name}\n`);
  }
  return dir;
}

describe("fetchSource", () => {
  it("single-plugin source: matches fetchPlugin's cacheDir and contents", async () => {
    await withTmpHome(async (home) => {
      const source = await makeFixturePlugin("local-plugin");
      try {
        const result = await fetchSource(source, home);

        expect(result.mode).toBe("single");
        expect(result.cacheDir).toBe(join(pluginsRoot(home), "local-plugin"));
        expect(await Bun.file(join(result.cacheDir, "maui.json")).exists()).toBe(true);
        expect(await Bun.file(join(result.cacheDir, "skills", "example", "SKILL.md")).exists()).toBe(true);
      } finally {
        await rm(source, { recursive: true, force: true });
      }
    });
  });

  it("marketplace source: caches the whole repo once, keyed by marketplace name, with a parsed catalog", async () => {
    await withTmpHome(async (home) => {
      const source = await makeFixtureMarketplace("my-toolkit", ["plugin-one", "plugin-two"]);
      try {
        const result = await fetchSource(source, home);

        expect(result.mode).toBe("marketplace");
        if (result.mode !== "marketplace") throw new Error("unreachable");
        expect(result.cacheDir).toBe(join(pluginsRoot(home), "my-toolkit"));
        expect(result.marketplaceName).toBe("my-toolkit");
        expect(result.catalog).toEqual([
          { name: "plugin-one", description: "does plugin-one", pluginPath: "plugins/plugin-one" },
          { name: "plugin-two", description: "does plugin-two", pluginPath: "plugins/plugin-two" },
        ]);
        expect(
          await Bun.file(join(result.cacheDir, "plugins", "plugin-one", "maui.json")).exists()
        ).toBe(true);
        expect(
          await Bun.file(join(result.cacheDir, "plugins", "plugin-two", "maui.json")).exists()
        ).toBe(true);
      } finally {
        await rm(source, { recursive: true, force: true });
      }
    });
  });

  it("marketplace source: re-fetching wipes and recopies the one shared cache dir", async () => {
    await withTmpHome(async (home) => {
      const source = await makeFixtureMarketplace("my-toolkit", ["plugin-one"]);
      try {
        await fetchSource(source, home);
        const second = await fetchSource(source, home);

        expect(second.cacheDir).toBe(join(pluginsRoot(home), "my-toolkit"));
        expect(
          await Bun.file(join(second.cacheDir, "plugins", "plugin-one", "maui.json")).exists()
        ).toBe(true);
      } finally {
        await rm(source, { recursive: true, force: true });
      }
    });
  });
});
