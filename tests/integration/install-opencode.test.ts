import { describe, it, expect } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir, chmod, lstat, readlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installPlugin } from "../../src/cli/install";
import { removePlugin } from "../../src/cli/remove";

async function withFakeOpenCodeBinary(fn: () => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "maui-fake-opencode-bin-"));
  const scriptPath = join(dir, "opencode");
  await writeFile(scriptPath, "#!/bin/sh\nexit 0\n");
  await chmod(scriptPath, 0o755);

  const originalPath = process.env.PATH;
  process.env.PATH = `${dir}:${originalPath}`;
  try {
    await fn();
  } finally {
    process.env.PATH = originalPath;
    await rm(dir, { recursive: true, force: true });
  }
}

async function withTmpDir(prefix: string, fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function makeFixturePlugin(name: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "maui-install-opencode-plugin-"));
  await writeFile(
    join(dir, "maui.json"),
    JSON.stringify({
      name,
      version: "1.0.0",
      targets: {
        opencode: { "skills/": "skills/", "commands/": "commands/" },
      },
    })
  );
  await mkdir(join(dir, "skills", "example"), { recursive: true });
  await writeFile(join(dir, "skills", "example", "SKILL.md"), "# Example\n");
  await mkdir(join(dir, "commands"), { recursive: true });
  await writeFile(join(dir, "commands", "example.md"), "# /example\n");
  await mkdir(join(dir, "hooks"), { recursive: true });
  await writeFile(join(dir, "hooks", "opencode-hooks.ts"), "export const ExamplePlugin = async () => ({});\n");
  return dir;
}

describe("installPlugin for the opencode target (global scope)", () => {
  it("symlinks skills/commands into ~/.config/opencode and renames the hooks file to <plugin-name>.ts", async () => {
    await withFakeOpenCodeBinary(async () => {
      await withTmpDir("maui-opencode-home-", async (home) => {
        const source = await makeFixturePlugin("example-plugin");
        try {
          const result = await installPlugin(source, { home });

          expect(result.agents.map((a) => a.agent)).toContain("opencode");
          expect(
            await Bun.file(
              join(home, ".config", "opencode", "skills", "example", "SKILL.md")
            ).exists()
          ).toBe(true);
          expect(
            await Bun.file(join(home, ".config", "opencode", "commands", "example.md")).exists()
          ).toBe(true);

          const hooksDest = join(home, ".config", "opencode", "plugins", "example-plugin.ts");
          const stat = await lstat(hooksDest);
          expect(stat.isSymbolicLink()).toBe(true);
          expect(await readlink(hooksDest)).toBe(
            join(home, ".maui", "plugins", "example-plugin", "hooks", "opencode-hooks.ts")
          );
        } finally {
          await rm(source, { recursive: true, force: true });
        }
      });
    });
  });

  it("skips opencode entirely when the binary isn't on $PATH", async () => {
    const originalPath = process.env.PATH;
    process.env.PATH = "/nonexistent-maui-test-path";
    try {
      await withTmpDir("maui-opencode-home-", async (home) => {
        const source = await makeFixturePlugin("example-plugin");
        try {
          const result = await installPlugin(source, { home });

          expect(result.agents.some((a) => a.agent === "opencode")).toBe(false);
          expect(result.skipped.some((entry) => entry.startsWith("opencode"))).toBe(true);
        } finally {
          await rm(source, { recursive: true, force: true });
        }
      });
    } finally {
      process.env.PATH = originalPath;
    }
  });

  it("removePlugin cleans up both the symlinked folders' children and the renamed hooks-file symlink", async () => {
    await withFakeOpenCodeBinary(async () => {
      await withTmpDir("maui-opencode-home-", async (home) => {
        const source = await makeFixturePlugin("example-plugin");
        try {
          await installPlugin(source, { home });
          const hooksDest = join(home, ".config", "opencode", "plugins", "example-plugin.ts");
          expect(await Bun.file(hooksDest).exists()).toBe(true);

          await removePlugin("example-plugin", { home });

          expect(await Bun.file(hooksDest).exists()).toBe(false);
          expect(
            await Bun.file(join(home, ".config", "opencode", "skills", "example")).exists()
          ).toBe(false);
        } finally {
          await rm(source, { recursive: true, force: true });
        }
      });
    });
  });
});

describe("installPlugin for the opencode target (project scope)", () => {
  it("symlinks into <project>/.opencode without requiring the opencode binary on $PATH", async () => {
    const originalPath = process.env.PATH;
    process.env.PATH = "/nonexistent-maui-test-path";
    try {
      await withTmpDir("maui-opencode-home-", async (home) => {
        await withTmpDir("maui-opencode-project-", async (cwd) => {
          const source = await makeFixturePlugin("example-plugin");
          try {
            const result = await installPlugin(source, { home, cwd, scope: "project" });

            expect(result.agents.map((a) => a.agent)).toContain("opencode");
            expect(
              await Bun.file(join(cwd, ".opencode", "skills", "example", "SKILL.md")).exists()
            ).toBe(true);

            const hooksDest = join(cwd, ".opencode", "plugins", "example-plugin.ts");
            const stat = await lstat(hooksDest);
            expect(stat.isSymbolicLink()).toBe(true);
          } finally {
            await rm(source, { recursive: true, force: true });
          }
        });
      });
    } finally {
      process.env.PATH = originalPath;
    }
  });
});
