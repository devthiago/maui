import { describe, it, expect } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir, lstat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installPlugin } from "../../src/cli/install";
import { readProjectConfig } from "../../src/core/project-config";

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

async function withTmpHome(fn: (home: string) => Promise<void>): Promise<void> {
  const home = await mkdtemp(join(tmpdir(), "maui-project-home-"));
  try {
    await fn(home);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

async function withTmpProject(fn: (cwd: string) => Promise<void>): Promise<void> {
  const cwd = await mkdtemp(join(tmpdir(), "maui-project-cwd-"));
  try {
    await fn(cwd);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

async function makeFixturePlugin(name: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "maui-project-plugin-"));
  await writeFile(
    join(dir, "maui.json"),
    JSON.stringify({ name, version: "1.0.0", targets: { _default: { "skills/": "skills/" } } })
  );
  await mkdir(join(dir, "skills", "example"), { recursive: true });
  await writeFile(join(dir, "skills", "example", "SKILL.md"), "# Example\n");
  return dir;
}

describe("installPlugin --scope project", () => {
  it("links into <project>/.agents instead of ~/.agents", async () => {
    await withTmpHome(async (home) => {
      await withTmpProject(async (cwd) => {
        const source = await makeFixturePlugin("example-plugin");
        try {
          await installPlugin(source, { home, cwd, scope: "project" });

          expect(await pathExists(join(cwd, ".agents", "skills", "example"))).toBe(true);
          expect(await pathExists(join(home, ".agents", "skills", "example"))).toBe(false);
        } finally {
          await rm(source, { recursive: true, force: true });
        }
      });
    });
  });

  it("records the choice in <project>/.maui/config.json", async () => {
    await withTmpHome(async (home) => {
      await withTmpProject(async (cwd) => {
        const source = await makeFixturePlugin("example-plugin");
        try {
          await installPlugin(source, { home, cwd, scope: "project" });

          const projectConfig = await readProjectConfig(cwd);
          expect(projectConfig?.plugins["example-plugin"]?.source).toBe(source);
        } finally {
          await rm(source, { recursive: true, force: true });
        }
      });
    });
  });

  it("reproduces the same linked set when run with no source, reading the project config", async () => {
    await withTmpHome(async (home) => {
      await withTmpProject(async (cwd) => {
        const source = await makeFixturePlugin("example-plugin");
        try {
          await installPlugin(source, { home, cwd, scope: "project" });

          await withTmpHome(async (freshHome) => {
            await installPlugin(undefined, { home: freshHome, cwd, scope: "project" });

            expect(await pathExists(join(cwd, ".agents", "skills", "example"))).toBe(true);
          });
        } finally {
          await rm(source, { recursive: true, force: true });
        }
      });
    });
  });

  it("skips native-marketplace targets at project scope rather than mis-installing them", async () => {
    await withTmpHome(async (home) => {
      await withTmpProject(async (cwd) => {
        const dir = await mkdtemp(join(tmpdir(), "maui-project-native-"));
        await writeFile(
          join(dir, "maui.json"),
          JSON.stringify({
            name: "native-plugin",
            version: "1.0.0",
            targets: { "claude-code": { marketplace: true } },
          })
        );
        try {
          const result = await installPlugin(dir, { home, cwd, scope: "project" });

          expect(result.agents).toEqual([]);
          expect(result.skipped.some((entry) => entry.startsWith("claude-code"))).toBe(true);
        } finally {
          await rm(dir, { recursive: true, force: true });
        }
      });
    });
  });
});
