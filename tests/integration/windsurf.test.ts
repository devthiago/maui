import { describe, it, expect } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installPlugin } from "../../src/cli/install";
import { getSymlinkAdapter } from "../../src/adapters/registry";

async function withTmpHome(fn: (home: string) => Promise<void>): Promise<void> {
  const home = await mkdtemp(join(tmpdir(), "maui-windsurf-home-"));
  try {
    await fn(home);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

async function withTmpProject(fn: (cwd: string) => Promise<void>): Promise<void> {
  const cwd = await mkdtemp(join(tmpdir(), "maui-windsurf-cwd-"));
  try {
    await fn(cwd);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

async function makeFixturePlugin(name: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "maui-windsurf-plugin-"));
  await writeFile(
    join(dir, "maui.json"),
    JSON.stringify({
      name,
      version: "1.0.0",
      targets: { windsurf: { "rules/": ".windsurf/rules/" } },
    })
  );
  await mkdir(join(dir, "rules"), { recursive: true });
  await writeFile(join(dir, "rules", "example.md"), "# Example rule\n");
  return dir;
}

describe("windsurfAdapter", () => {
  it('is registered under the id "windsurf" with a project target but no global target', () => {
    const adapter = getSymlinkAdapter("windsurf");
    expect(adapter).toBeDefined();
    expect(adapter!.projectRoot).toBeDefined();
    expect(adapter!.globalRoot).toBeUndefined();
  });

  it("links a plugin's windsurf target into <project>/.windsurf/rules/ at project scope", async () => {
    await withTmpHome(async (home) => {
      await withTmpProject(async (cwd) => {
        const source = await makeFixturePlugin("example-plugin");
        try {
          const result = await installPlugin(source, { home, cwd, scope: "project" });

          expect(result.agents.some((a) => a.agent === "windsurf")).toBe(true);
          expect(
            await Bun.file(join(cwd, ".windsurf", "rules", "example.md")).exists()
          ).toBe(true);
        } finally {
          await rm(source, { recursive: true, force: true });
        }
      });
    });
  });

  it("skips windsurf at global scope: its only global target is a single shared file, not a directory", async () => {
    await withTmpHome(async (home) => {
      const source = await makeFixturePlugin("example-plugin");
      try {
        const result = await installPlugin(source, { home, scope: "global" });

        expect(result.agents.some((a) => a.agent === "windsurf")).toBe(false);
        expect(result.skipped.some((entry) => entry.startsWith("windsurf"))).toBe(true);
      } finally {
        await rm(source, { recursive: true, force: true });
      }
    });
  });
});
