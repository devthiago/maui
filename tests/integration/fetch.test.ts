import { describe, it, expect } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir as mkdirNode, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";
import { fetchPlugin, pluginsRoot } from "../../src/core/fetch";

async function withTmpHome(fn: (home: string) => Promise<void>): Promise<void> {
  const home = await mkdtemp(join(tmpdir(), "maui-fetch-home-"));
  try {
    await fn(home);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

async function makeFixturePlugin(name: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "maui-fixture-plugin-"));
  await writeFile(
    join(dir, "maui.json"),
    JSON.stringify({ name, version: "1.0.0", targets: { _default: { "skills/": "skills/" } } })
  );
  await mkdirNode(join(dir, "skills", "example"), { recursive: true });
  await writeFile(join(dir, "skills", "example", "SKILL.md"), "# Example\n");
  return dir;
}

describe("fetchPlugin", () => {
  it("populates ~/.maui/plugins/<name> from a local path source", async () => {
    await withTmpHome(async (home) => {
      const source = await makeFixturePlugin("local-plugin");
      try {
        const targetDir = await fetchPlugin(source, home);

        expect(targetDir).toBe(join(pluginsRoot(home), "local-plugin"));
        expect(await Bun.file(join(targetDir, "maui.json")).exists()).toBe(true);
        expect(await Bun.file(join(targetDir, "skills", "example", "SKILL.md")).exists()).toBe(true);
      } finally {
        await rm(source, { recursive: true, force: true });
      }
    });
  });

  it("is idempotent: fetching the same local plugin twice doesn't duplicate or error", async () => {
    await withTmpHome(async (home) => {
      const source = await makeFixturePlugin("idempotent-plugin");
      try {
        await fetchPlugin(source, home);
        const targetDir = await fetchPlugin(source, home);

        expect(targetDir).toBe(join(pluginsRoot(home), "idempotent-plugin"));
        expect(await Bun.file(join(targetDir, "maui.json")).exists()).toBe(true);
      } finally {
        await rm(source, { recursive: true, force: true });
      }
    });
  });

  it("populates the cache from a git source", async () => {
    await withTmpHome(async (home) => {
      const sourceContent = await makeFixturePlugin("git-plugin");
      const gitRepo = await mkdtemp(join(tmpdir(), "maui-fixture-git-"));
      try {
        await cp(sourceContent, gitRepo, { recursive: true });
        await $`git -C ${gitRepo} init -q`.quiet();
        await $`git -C ${gitRepo} -c user.email=test@example.com -c user.name=Test add -A`.quiet();
        await $`git -C ${gitRepo} -c user.email=test@example.com -c user.name=Test commit -q -m init`.quiet();

        const targetDir = await fetchPlugin(`file://${gitRepo}`, home);

        expect(targetDir).toBe(join(pluginsRoot(home), "git-plugin"));
        expect(await Bun.file(join(targetDir, "maui.json")).exists()).toBe(true);
      } finally {
        await rm(sourceContent, { recursive: true, force: true });
        await rm(gitRepo, { recursive: true, force: true });
      }
    });
  });
});
