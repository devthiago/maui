import { describe, it, expect } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installPlugin } from "../../src/cli/install";
import { removePlugin } from "../../src/cli/remove";

async function withTmpHome(fn: (home: string) => Promise<void>): Promise<void> {
  const home = await mkdtemp(join(tmpdir(), "maui-postinstall-home-"));
  try {
    await fn(home);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

async function makeFixturePlugin(name: string, extra: Record<string, unknown> = {}): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "maui-postinstall-plugin-"));
  await writeFile(
    join(dir, "maui.json"),
    JSON.stringify({
      name,
      version: "1.0.0",
      targets: { _default: { "skills/": "skills/" } },
      postinstall: "postinstall.ts",
      ...extra,
    })
  );
  await mkdir(join(dir, "skills", "example"), { recursive: true });
  await writeFile(join(dir, "skills", "example", "SKILL.md"), "# Example\n");
  await writeFile(
    join(dir, "postinstall.ts"),
    'export default async function (ctx, api) {\n' +
      '  await api.upsertBlock(ctx.contextFile, "Added by " + ctx.pluginName);\n' +
      "}\n"
  );
  return dir;
}

describe("postinstall/postremove flow", () => {
  it("runs postinstall for the installed agent and writes the block to the correct contextFile", async () => {
    await withTmpHome(async (home) => {
      const source = await makeFixturePlugin("example-plugin");
      try {
        await installPlugin(source, { home, confirm: async () => true });

        const contextFile = join(home, "AGENTS.md");
        const content = await Bun.file(contextFile).text();
        expect(content).toContain("<!-- maui:example-plugin:start -->");
        expect(content).toContain("Added by example-plugin");
      } finally {
        await rm(source, { recursive: true, force: true });
      }
    });
  });

  it("strips the block on remove even with no postremove script defined", async () => {
    await withTmpHome(async (home) => {
      const source = await makeFixturePlugin("example-plugin");
      try {
        await installPlugin(source, { home, confirm: async () => true });
        const contextFile = join(home, "AGENTS.md");
        expect(await Bun.file(contextFile).text()).toContain("maui:example-plugin:start");

        await removePlugin("example-plugin", { home });

        const after = await Bun.file(contextFile).text();
        expect(after).not.toContain("maui:example-plugin:start");
      } finally {
        await rm(source, { recursive: true, force: true });
      }
    });
  });

  it("does not prompt and behaves exactly as before for a plugin with no hooks", async () => {
    await withTmpHome(async (home) => {
      const dir = await mkdtemp(join(tmpdir(), "maui-no-hooks-plugin-"));
      await writeFile(
        join(dir, "maui.json"),
        JSON.stringify({
          name: "no-hooks-plugin",
          version: "1.0.0",
          targets: { _default: { "skills/": "skills/" } },
        })
      );
      await mkdir(join(dir, "skills", "example"), { recursive: true });
      await writeFile(join(dir, "skills", "example", "SKILL.md"), "# Example\n");

      try {
        let promptCalled = false;
        await installPlugin(dir, {
          home,
          confirm: async () => {
            promptCalled = true;
            return true;
          },
        });

        expect(promptCalled).toBe(false);
        expect(await Bun.file(join(home, "AGENTS.md")).exists()).toBe(false);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  });
});
