import { describe, it, expect } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installPlugin } from "../../src/cli/install";
import { readRegistry } from "../../src/core/registry";

async function withTmpHome(fn: (home: string) => Promise<void>): Promise<void> {
  const home = await mkdtemp(join(tmpdir(), "maui-install-home-"));
  try {
    await fn(home);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

async function makeFixturePlugin(name: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "maui-install-plugin-"));
  await writeFile(
    join(dir, "maui.json"),
    JSON.stringify({
      name,
      version: "1.0.0",
      targets: {
        _default: { "skills/": "skills/" },
      },
    })
  );
  await mkdir(join(dir, "skills", "example"), { recursive: true });
  await writeFile(join(dir, "skills", "example", "SKILL.md"), "# Example\n");
  return dir;
}

describe("installPlugin", () => {
  it("populates ~/.agents/<subfolder> per the plugin's _default mapping, unconditionally", async () => {
    await withTmpHome(async (home) => {
      const source = await makeFixturePlugin("example-plugin");
      try {
        const result = await installPlugin(source, { home });

        expect(result.pluginName).toBe("example-plugin");
        expect(
          await Bun.file(join(home, ".agents", "skills", "example", "SKILL.md")).exists()
        ).toBe(true);

        const registry = await readRegistry(home);
        const registered = registry.plugins["example-plugin"];
        expect(registered).toBeDefined();
        expect(registered!.agents).toEqual([
          {
            agent: "_default",
            scope: "global",
            kind: "symlink",
            symlinks: [join(home, ".agents", "skills", "example")],
          },
        ]);
      } finally {
        await rm(source, { recursive: true, force: true });
      }
    });
  });

  it("is idempotent across repeated installs of the same plugin", async () => {
    await withTmpHome(async (home) => {
      const source = await makeFixturePlugin("idempotent-plugin");
      try {
        await installPlugin(source, { home });
        await installPlugin(source, { home });

        expect(
          await Bun.file(join(home, ".agents", "skills", "example", "SKILL.md")).exists()
        ).toBe(true);
      } finally {
        await rm(source, { recursive: true, force: true });
      }
    });
  });
});
