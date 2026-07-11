import { describe, it, expect } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installPlugin } from "../../src/cli/install";
import { getSymlinkAdapter } from "../../src/adapters/registry";

async function withTmpHome(fn: (home: string) => Promise<void>): Promise<void> {
  const home = await mkdtemp(join(tmpdir(), "maui-cursor-home-"));
  try {
    await fn(home);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

async function withTmpProject(fn: (cwd: string) => Promise<void>): Promise<void> {
  const cwd = await mkdtemp(join(tmpdir(), "maui-cursor-cwd-"));
  try {
    await fn(cwd);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

async function makeFixturePlugin(name: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "maui-cursor-plugin-"));
  await writeFile(
    join(dir, "maui.json"),
    JSON.stringify({
      name,
      version: "1.0.0",
      targets: { cursor: { "cursor-rules/": ".cursor/rules/" } },
    })
  );
  await mkdir(join(dir, "cursor-rules"), { recursive: true });
  await writeFile(join(dir, "cursor-rules", "example.mdc"), "# Example rule\n");
  return dir;
}

describe("cursorAdapter", () => {
  it('is registered under the id "cursor" with a project target but no global target', () => {
    const adapter = getSymlinkAdapter("cursor");
    expect(adapter).toBeDefined();
    expect(adapter!.projectRoot).toBeDefined();
    expect(adapter!.globalRoot).toBeUndefined();
  });

  it("links a plugin's cursor target into <project>/.cursor/rules/ at project scope", async () => {
    await withTmpHome(async (home) => {
      await withTmpProject(async (cwd) => {
        const source = await makeFixturePlugin("example-plugin");
        try {
          const result = await installPlugin(source, { home, cwd, scope: "project" });

          expect(result.agents.some((a) => a.agent === "cursor")).toBe(true);
          expect(
            await Bun.file(join(cwd, ".cursor", "rules", "example.mdc")).exists()
          ).toBe(true);
        } finally {
          await rm(source, { recursive: true, force: true });
        }
      });
    });
  });

  it("skips cursor at global scope, since it has no filesystem global target", async () => {
    await withTmpHome(async (home) => {
      const source = await makeFixturePlugin("example-plugin");
      try {
        const result = await installPlugin(source, { home, scope: "global" });

        expect(result.agents.some((a) => a.agent === "cursor")).toBe(false);
        expect(result.skipped.some((entry) => entry.startsWith("cursor"))).toBe(true);
      } finally {
        await rm(source, { recursive: true, force: true });
      }
    });
  });
});
