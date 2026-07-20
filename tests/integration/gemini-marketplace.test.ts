import { describe, it, expect } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir, chmod, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installMarketplace } from "../../src/cli/install";
import { removePlugin } from "../../src/cli/remove";
import { readRegistry } from "../../src/core/registry";

async function withFakeGemini(fn: (logPath: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "maui-fake-gemini-marketplace-"));
  const logPath = join(dir, "invocations.log");
  const scriptPath = join(dir, "gemini");
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
  const home = await mkdtemp(join(tmpdir(), "maui-gemini-marketplace-home-"));
  try {
    await fn(home);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

async function makeFixtureMarketplace(marketplaceName: string, pluginNames: string[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "maui-gemini-fixture-marketplace-"));
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
    await mkdir(join(dir, "plugins", name), { recursive: true });
    await writeFile(
      join(dir, "plugins", name, "maui.json"),
      JSON.stringify({
        name,
        version: "1.0.0",
        targets: {
          gemini: { marketplace: true, repo: `https://github.com/example-user/${marketplaceName}` },
        },
      })
    );
  }
  return dir;
}

describe("installMarketplace against Gemini (installsWholeMarketplace)", () => {
  it("installs the whole repo exactly once for N selections, recording gemini on every selected plugin's registry entry", async () => {
    await withFakeGemini(async (logPath) => {
      await withTmpHome(async (home) => {
        const source = await makeFixtureMarketplace("my-toolkit", ["plugin-one", "plugin-two", "plugin-three"]);
        try {
          const results = await installMarketplace(source, { home, allPlugins: true });
          expect(results.length).toBe(3);

          const log = await readFile(logPath, "utf-8");
          const lines = log.trim().split("\n");
          expect(lines.filter((line) => line === "extensions install https://github.com/example-user/my-toolkit").length).toBe(1);

          const registry = await readRegistry(home);
          for (const name of ["plugin-one", "plugin-two", "plugin-three"]) {
            const entry = registry.plugins[name];
            expect(entry?.agents.some((a) => a.agent === "gemini")).toBe(true);
          }
        } finally {
          await rm(source, { recursive: true, force: true });
        }
      });
    });
  });

  it("removing a plugin while siblings remain does not uninstall the shared gemini extension; removing the last one does, by the marketplace's own name", async () => {
    await withFakeGemini(async (logPath) => {
      await withTmpHome(async (home) => {
        const source = await makeFixtureMarketplace("my-toolkit", ["plugin-one", "plugin-two"]);
        try {
          await installMarketplace(source, { home, allPlugins: true });

          await removePlugin("plugin-one", { home });
          let log = await readFile(logPath, "utf-8");
          expect(log).not.toContain("extensions uninstall");

          await removePlugin("plugin-two", { home });
          log = await readFile(logPath, "utf-8");
          expect(log.trim().split("\n")).toContain("extensions uninstall my-toolkit");
          // never uninstalled by an individual plugin's own name
          expect(log).not.toContain("extensions uninstall plugin-one");
          expect(log).not.toContain("extensions uninstall plugin-two");
        } finally {
          await rm(source, { recursive: true, force: true });
        }
      });
    });
  });
});
