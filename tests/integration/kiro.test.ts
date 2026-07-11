import { describe, it, expect } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fetchPlugin } from "../../src/core/fetch";
import { linkPlugin } from "../../src/cli/link";
import { getSymlinkAdapter } from "../../src/adapters/registry";

async function withTmpHome(fn: (home: string) => Promise<void>): Promise<void> {
  const home = await mkdtemp(join(tmpdir(), "maui-kiro-home-"));
  try {
    await fn(home);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

async function makeFixturePlugin(name: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "maui-kiro-plugin-"));
  await writeFile(
    join(dir, "maui.json"),
    JSON.stringify({
      name,
      version: "1.0.0",
      targets: {
        kiro: { "rules/": ".kiro/steering/" },
      },
    })
  );
  await mkdir(join(dir, "rules"), { recursive: true });
  await writeFile(join(dir, "rules", "example.md"), "# Example rule\n");
  return dir;
}

describe("kiroAdapter", () => {
  it('is registered under the id "kiro"', () => {
    expect(getSymlinkAdapter("kiro")).toBeDefined();
  });

  it("resolves its global root to $HOME, since Kiro's own dot-folder is scope-relative", () => {
    const adapter = getSymlinkAdapter("kiro")!;
    expect(adapter.globalRoot?.("/home/user")).toBe("/home/user");
  });

  it("links a plugin's rules/ into ~/.kiro/steering/ via linkPlugin", async () => {
    await withTmpHome(async (home) => {
      const source = await makeFixturePlugin("example-plugin");
      try {
        await fetchPlugin(source, home);
        await linkPlugin("example-plugin", "kiro", { home });

        expect(await Bun.file(join(home, ".kiro", "steering", "example.md")).exists()).toBe(true);
      } finally {
        await rm(source, { recursive: true, force: true });
      }
    });
  });
});
