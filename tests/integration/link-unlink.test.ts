import { describe, it, expect } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir, lstat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fetchPlugin } from "../../src/core/fetch";
import { installPlugin } from "../../src/cli/install";
import { linkPlugin, UnknownAgentError, NoTargetForAgentError } from "../../src/cli/link";
import { unlinkPlugin, AgentNotLinkedError } from "../../src/cli/unlink";
import { readRegistry, writeRegistry } from "../../src/core/registry";

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

async function withTmpHome(fn: (home: string) => Promise<void>): Promise<void> {
  const home = await mkdtemp(join(tmpdir(), "maui-link-home-"));
  try {
    await fn(home);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

async function makeFixturePlugin(name: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "maui-link-plugin-"));
  await writeFile(
    join(dir, "maui.json"),
    JSON.stringify({ name, version: "1.0.0", targets: { _default: { "skills/": "skills/" } } })
  );
  await mkdir(join(dir, "skills", "example"), { recursive: true });
  await writeFile(join(dir, "skills", "example", "SKILL.md"), "# Example\n");
  return dir;
}

describe("linkPlugin", () => {
  it("links an already-cached plugin to an agent it's not yet linked to, without re-fetching", async () => {
    await withTmpHome(async (home) => {
      const source = await makeFixturePlugin("example-plugin");
      try {
        await fetchPlugin(source, home);
        const linkedPath = join(home, ".agents", "skills", "example");
        expect(await pathExists(linkedPath)).toBe(false);

        await linkPlugin("example-plugin", "_default", { home });

        expect(await pathExists(linkedPath)).toBe(true);
        const registry = await readRegistry(home);
        expect(registry.plugins["example-plugin"]!.agents).toEqual([
          { agent: "_default", scope: "global", kind: "symlink", symlinks: [linkedPath] },
        ]);
      } finally {
        await rm(source, { recursive: true, force: true });
      }
    });
  });

  it("throws for an unknown agent id", async () => {
    await withTmpHome(async (home) => {
      const source = await makeFixturePlugin("example-plugin");
      try {
        await fetchPlugin(source, home);
        await expect(linkPlugin("example-plugin", "not-a-real-agent", { home })).rejects.toThrow(
          UnknownAgentError
        );
      } finally {
        await rm(source, { recursive: true, force: true });
      }
    });
  });

  it("throws when the plugin's manifest has no target for that agent", async () => {
    await withTmpHome(async (home) => {
      const dir = await mkdtemp(join(tmpdir(), "maui-link-plugin-"));
      await writeFile(
        join(dir, "maui.json"),
        JSON.stringify({ name: "no-default-plugin", version: "1.0.0", targets: {} })
      );
      try {
        await fetchPlugin(dir, home);
        await expect(linkPlugin("no-default-plugin", "_default", { home })).rejects.toThrow(
          NoTargetForAgentError
        );
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  });
});

describe("unlinkPlugin", () => {
  it("removes only the given agent's symlinks, leaving other agents in the registry intact", async () => {
    await withTmpHome(async (home) => {
      const source = await makeFixturePlugin("example-plugin");
      try {
        await installPlugin(source, { home });

        const registry = await readRegistry(home);
        registry.plugins["example-plugin"]!.agents.push({
          agent: "cursor",
          scope: "global",
          kind: "symlink",
          symlinks: [],
        });
        await writeRegistry(registry, home);

        const linkedPath = join(home, ".agents", "skills", "example");
        expect(await pathExists(linkedPath)).toBe(true);

        await unlinkPlugin("example-plugin", "_default", { home });

        expect(await pathExists(linkedPath)).toBe(false);
        const after = await readRegistry(home);
        expect(after.plugins["example-plugin"]!.agents).toEqual([
          { agent: "cursor", scope: "global", kind: "symlink", symlinks: [] },
        ]);
      } finally {
        await rm(source, { recursive: true, force: true });
      }
    });
  });

  it("throws AgentNotLinkedError when the plugin isn't linked to that agent", async () => {
    await withTmpHome(async (home) => {
      const source = await makeFixturePlugin("example-plugin");
      try {
        await installPlugin(source, { home });
        await expect(unlinkPlugin("example-plugin", "cursor", { home })).rejects.toThrow(
          AgentNotLinkedError
        );
      } finally {
        await rm(source, { recursive: true, force: true });
      }
    });
  });
});
