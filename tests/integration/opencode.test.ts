import { describe, it, expect } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir, chmod, lstat, readlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openCodeAdapter } from "../../src/adapters/opencode";

async function withFakeOpenCodeBinary(fn: () => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "maui-fake-opencode-"));
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

describe("openCodeAdapter.detect", () => {
  it("returns false when opencode is not on $PATH", async () => {
    const originalPath = process.env.PATH;
    process.env.PATH = "/nonexistent-maui-test-path";
    try {
      expect(await openCodeAdapter.detect()).toBe(false);
    } finally {
      process.env.PATH = originalPath;
    }
  });

  it("returns true when an opencode binary is on $PATH", async () => {
    await withFakeOpenCodeBinary(async () => {
      expect(await openCodeAdapter.detect()).toBe(true);
    });
  });
});

describe("openCodeAdapter scope roots", () => {
  it("resolves the global root to ~/.config/opencode", () => {
    expect(openCodeAdapter.globalRoot("/home/user")).toBe("/home/user/.config/opencode");
  });

  it("resolves the project root to <project>/.opencode", () => {
    expect(openCodeAdapter.projectRoot("/repo")).toBe("/repo/.opencode");
  });
});

describe("openCodeAdapter.linkExtra", () => {
  it("symlinks hooks/opencode-hooks.ts into <root>/plugins/<plugin-name>.ts", async () => {
    await withTmpDir("maui-opencode-linkextra-", async (root) => {
      const pluginDir = join(root, "plugin-src");
      await mkdir(join(pluginDir, "hooks"), { recursive: true });
      await writeFile(join(pluginDir, "hooks", "opencode-hooks.ts"), "export const ExamplePlugin = async () => ({});\n");
      const rootDir = join(root, "opencode-home");

      const linked = await openCodeAdapter.linkExtra(pluginDir, rootDir, "example-plugin");

      const destFile = join(rootDir, "plugins", "example-plugin.ts");
      expect(linked).toEqual([destFile]);
      const stat = await lstat(destFile);
      expect(stat.isSymbolicLink()).toBe(true);
      expect(await readlink(destFile)).toBe(join(pluginDir, "hooks", "opencode-hooks.ts"));
    });
  });

  it("is a no-op when the plugin has no hooks/opencode-hooks.ts file", async () => {
    await withTmpDir("maui-opencode-linkextra-", async (root) => {
      const pluginDir = join(root, "plugin-src");
      await mkdir(pluginDir, { recursive: true });
      const rootDir = join(root, "opencode-home");

      const linked = await openCodeAdapter.linkExtra(pluginDir, rootDir, "example-plugin");

      expect(linked).toEqual([]);
      expect(await Bun.file(join(rootDir, "plugins", "example-plugin.ts")).exists()).toBe(false);
    });
  });
});
