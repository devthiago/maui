import { describe, it, expect } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installMarketplace, installPlugin } from "../../src/cli/install";
import { updatePlugin, updateAll } from "../../src/cli/update";
import { fetchSource, type FetchedSource } from "../../src/core/fetch";

async function withTmpHome(fn: (home: string) => Promise<void>): Promise<void> {
  const home = await mkdtemp(join(tmpdir(), "maui-update-marketplace-home-"));
  try {
    await fn(home);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

async function makeFixtureMarketplace(marketplaceName: string, pluginNames: string[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "maui-update-fixture-marketplace-"));
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
    await mkdir(join(dir, "plugins", name, "skills", `${name}-skill`), { recursive: true });
    await writeFile(
      join(dir, "plugins", name, "maui.json"),
      JSON.stringify({ name, version: "1.0.0", targets: { _default: { "skills/": "skills/" } } })
    );
    await writeFile(
      join(dir, "plugins", name, "skills", `${name}-skill`, "SKILL.md"),
      `# ${name} v1\n`
    );
  }
  return dir;
}

async function makeFixturePlugin(name: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "maui-update-single-plugin-"));
  await writeFile(
    join(dir, "maui.json"),
    JSON.stringify({ name, version: "1.0.0", targets: { _default: { "skills/": "skills/" } } })
  );
  await mkdir(join(dir, "skills", "example"), { recursive: true });
  await writeFile(join(dir, "skills", "example", "SKILL.md"), "# v1\n");
  return dir;
}

function countingFetch(): {
  fetchImpl: (source: string, home?: string) => Promise<FetchedSource>;
  callCount: () => number;
} {
  let count = 0;
  return {
    fetchImpl: async (source: string, home?: string) => {
      count++;
      return fetchSource(source, home);
    },
    callCount: () => count,
  };
}

describe("updateAll dedup by sourceRepo", () => {
  it("refreshes a shared marketplace clone exactly once for 2 plugins sharing it, reporting refreshed for both", async () => {
    await withTmpHome(async (home) => {
      const source = await makeFixtureMarketplace("my-toolkit", ["plugin-one", "plugin-two"]);
      try {
        await installMarketplace(source, { home, allPlugins: true });

        const counter = countingFetch();
        const results = await updateAll({ home, fetchImpl: counter.fetchImpl });

        expect(counter.callCount()).toBe(1);
        expect(results.map((r) => r.pluginName).sort()).toEqual(["plugin-one", "plugin-two"]);
        expect(results.every((r) => r.refreshed)).toBe(true);
      } finally {
        await rm(source, { recursive: true, force: true });
      }
    });
  });

  it("still refreshes each independently for 2 unrelated single-plugin sources (regression, no over-deduping)", async () => {
    await withTmpHome(async (home) => {
      const sourceA = await makeFixturePlugin("plugin-a");
      const sourceB = await makeFixturePlugin("plugin-b");
      try {
        await installPlugin(sourceA, { home });
        await installPlugin(sourceB, { home });

        const counter = countingFetch();
        const results = await updateAll({ home, fetchImpl: counter.fetchImpl });

        expect(counter.callCount()).toBe(2);
        expect(results.map((r) => r.pluginName).sort()).toEqual(["plugin-a", "plugin-b"]);
      } finally {
        await rm(sourceA, { recursive: true, force: true });
        await rm(sourceB, { recursive: true, force: true });
      }
    });
  });

  it("updatePlugin(name) on one marketplace-shared plugin refreshes the shared clone; the sibling's symlinks resolve to the new content too, with no relink", async () => {
    await withTmpHome(async (home) => {
      const source = await makeFixtureMarketplace("my-toolkit", ["plugin-one", "plugin-two"]);
      try {
        await installMarketplace(source, { home, allPlugins: true });

        await writeFile(
          join(source, "plugins", "plugin-one", "skills", "plugin-one-skill", "SKILL.md"),
          "# plugin-one v2\n"
        );

        const result = await updatePlugin("plugin-one", { home });
        expect(result.refreshed).toBe(true);

        // plugin-one's own symlink reflects the update
        expect(
          await Bun.file(
            join(home, ".agents", "skills", "plugin-one-skill", "SKILL.md")
          ).text()
        ).toBe("# plugin-one v2\n");
        // plugin-two's symlink (sharing the same clone) still resolves fine, unaffected/untouched
        expect(
          await Bun.file(
            join(home, ".agents", "skills", "plugin-two-skill", "SKILL.md")
          ).text()
        ).toBe("# plugin-two v1\n");
      } finally {
        await rm(source, { recursive: true, force: true });
      }
    });
  });
});
