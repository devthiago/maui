import { describe, it, expect } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir, chmod, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installMarketplace } from "../../src/cli/install";
import { readRegistry } from "../../src/core/registry";

async function withFakeClaude(fn: (logPath: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "maui-fake-claude-marketplace-"));
  const logPath = join(dir, "invocations.log");
  const scriptPath = join(dir, "claude");
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
  const home = await mkdtemp(join(tmpdir(), "maui-claude-marketplace-home-"));
  try {
    await fn(home);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

async function makeFixtureMarketplace(marketplaceName: string, pluginNames: string[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "maui-claude-fixture-marketplace-"));
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
          "claude-code": {
            marketplace: true,
            repo: `example-user/${marketplaceName}`,
            marketplaceName,
          },
        },
      })
    );
  }
  return dir;
}

describe("installMarketplace against Claude Code", () => {
  it("selecting 2 of 3 plugins calls plugin install once per selected plugin, sharing the same repo/marketplaceName", async () => {
    await withFakeClaude(async (logPath) => {
      await withTmpHome(async (home) => {
        const source = await makeFixtureMarketplace("my-toolkit", [
          "plugin-one",
          "plugin-two",
          "plugin-three",
        ]);
        try {
          const results = await installMarketplace(source, {
            home,
            pluginFlags: ["plugin-one", "plugin-two"],
          });

          expect(results.map((r) => r.pluginName).sort()).toEqual(["plugin-one", "plugin-two"]);

          const log = await readFile(logPath, "utf-8");
          const lines = log.trim().split("\n");
          expect(lines).toContain("plugin install plugin-one@my-toolkit");
          expect(lines).toContain("plugin install plugin-two@my-toolkit");
          expect(lines).not.toContain("plugin install plugin-three@my-toolkit");
          // "marketplace add" runs once per selected plugin's install() call
          // (each call bundles add+install together) — harmless since
          // claude's own "add" is idempotent for an already-known
          // marketplace, not deduped to a single call in this phase.
          expect(lines.filter((line) => line === "plugin marketplace add example-user/my-toolkit").length).toBe(2);

          const registry = await readRegistry(home);
          const one = registry.plugins["plugin-one"];
          const two = registry.plugins["plugin-two"];
          expect(one?.agents[0]?.identity?.pluginName).toBe("plugin-one");
          expect(two?.agents[0]?.identity?.pluginName).toBe("plugin-two");
          expect(one?.agents[0]?.identity?.marketplaceName).toBe("my-toolkit");
          expect(one?.agents[0]?.identity?.marketplaceName).toBe(two?.agents[0]?.identity?.marketplaceName);
          expect(one?.agents[0]?.identity?.repo).toBe(two?.agents[0]?.identity?.repo);
        } finally {
          await rm(source, { recursive: true, force: true });
        }
      });
    });
  });
});
