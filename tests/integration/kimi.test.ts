import { describe, it, expect } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fetchPlugin } from "../../src/core/fetch";
import { linkPlugin } from "../../src/cli/link";
import { getSymlinkAdapter } from "../../src/adapters/registry";
import { kimiAdapter } from "../../src/adapters/kimi";

async function withTmpHome(fn: (home: string) => Promise<void>): Promise<void> {
  const home = await mkdtemp(join(tmpdir(), "maui-kimi-home-"));
  try {
    await fn(home);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

async function withFakeKimiBinary(fn: () => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "maui-fake-kimi-"));
  const scriptPath = join(dir, "kimi");
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

async function makeFixturePlugin(name: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "maui-kimi-plugin-"));
  await writeFile(
    join(dir, "maui.json"),
    JSON.stringify({
      name,
      version: "1.0.0",
      targets: {
        kimi: { "skills/": "skills/", "agents/": "agents/", "commands/": "skills/" },
      },
    })
  );
  await mkdir(join(dir, "skills"), { recursive: true });
  await writeFile(join(dir, "skills", "example.md"), "# Example skill\n");
  await mkdir(join(dir, "agents"), { recursive: true });
  await writeFile(join(dir, "agents", "reviewer.md"), "# Example agent\n");
  await mkdir(join(dir, "commands"), { recursive: true });
  await writeFile(join(dir, "commands", "deploy.md"), "# Example command\n");
  return dir;
}

describe("kimiAdapter", () => {
  it('is registered under the id "kimi"', () => {
    expect(getSymlinkAdapter("kimi")).toBeDefined();
  });

  it("resolves global root to ~/.kimi-code and project root to <project>/.kimi-code", () => {
    expect(kimiAdapter.globalRoot("/home/user")).toBe("/home/user/.kimi-code");
    expect(kimiAdapter.projectRoot("/repo")).toBe("/repo/.kimi-code");
  });

  describe("detect", () => {
    it("returns false when kimi is not on $PATH", async () => {
      const originalPath = process.env.PATH;
      process.env.PATH = "/nonexistent-maui-test-path";
      try {
        expect(await kimiAdapter.detect()).toBe(false);
      } finally {
        process.env.PATH = originalPath;
      }
    });

    it("returns true when a kimi binary is on $PATH", async () => {
      await withFakeKimiBinary(async () => {
        expect(await kimiAdapter.detect()).toBe(true);
      });
    });
  });

  it("links a plugin's skills/ and agents/ into ~/.kimi-code/{skills,agents}/ via linkPlugin", async () => {
    await withTmpHome(async (home) => {
      const source = await makeFixturePlugin("example-plugin");
      try {
        await fetchPlugin(source, home);
        await linkPlugin("example-plugin", "kimi", { home });

        expect(await Bun.file(join(home, ".kimi-code", "skills", "example.md")).exists()).toBe(true);
        expect(await Bun.file(join(home, ".kimi-code", "agents", "reviewer.md")).exists()).toBe(true);
      } finally {
        await rm(source, { recursive: true, force: true });
      }
    });
  });

  it("routes a plugin's commands/ into the same .kimi-code/skills/ destination as skills/", async () => {
    await withTmpHome(async (home) => {
      const source = await makeFixturePlugin("example-plugin");
      try {
        await fetchPlugin(source, home);
        await linkPlugin("example-plugin", "kimi", { home });

        expect(await Bun.file(join(home, ".kimi-code", "skills", "deploy.md")).exists()).toBe(true);
        expect(await Bun.file(join(home, ".kimi-code", "skills", "example.md")).exists()).toBe(true);
      } finally {
        await rm(source, { recursive: true, force: true });
      }
    });
  });
});
