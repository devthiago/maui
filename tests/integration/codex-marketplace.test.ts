import { describe, it, expect } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir, chmod, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { codexAdapter } from "../../src/adapters/codex";
import { installMarketplace, installPlugin } from "../../src/cli/install";

async function withFakeCli(
  binName: string,
  fn: (logPath: string) => Promise<void>
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), `maui-fake-${binName}-marketplace-`));
  const logPath = join(dir, "invocations.log");
  const scriptPath = join(dir, binName);
  await writeFile(scriptPath, `#!/bin/sh\necho "$@" >> "${logPath}"\nexit 0\n`);
  await chmod(scriptPath, 0o755);

  // codexAdapter.detect() checks for a "codex" binary on $PATH — separate
  // from the "npx" binary the install/remove commands actually shell out
  // to — so the orchestration-level tests need both present.
  if (binName === "npx") {
    const codexStub = join(dir, "codex");
    await writeFile(codexStub, "#!/bin/sh\nexit 0\n");
    await chmod(codexStub, 0o755);
  }

  const originalPath = process.env.PATH;
  process.env.PATH = `${dir}:${originalPath}`;
  try {
    await fn(logPath);
  } finally {
    process.env.PATH = originalPath;
    await rm(dir, { recursive: true, force: true });
  }
}

async function withTmpHome(fn: (home: string) => Promise<void>): Promise<void> {
  const home = await mkdtemp(join(tmpdir(), "maui-codex-marketplace-home-"));
  try {
    await fn(home);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

describe("codexAdapter sourceMode branching", () => {
  it("install(): sourceMode 'marketplace' with a pluginPath builds the direct-path singular --plugin command", async () => {
    await withFakeCli("npx", async (logPath) => {
      await withTmpHome(async (home) => {
        await codexAdapter.install(
          {
            pluginName: "plugin-one",
            repo: "example-user/my-toolkit",
            marketplaceName: "my-toolkit",
            pluginPath: "plugins/plugin-one",
          },
          { home, confirm: async () => true, sourceMode: "marketplace" }
        );

        const log = await readFile(logPath, "utf-8");
        expect(log.trim()).toBe(
          "codex-marketplace add example-user/my-toolkit/plugins/plugin-one --plugin --global"
        );
      });
    });
  });

  it("remove() is unaffected by sourceMode — same per-plugin identity either way", async () => {
    await withFakeCli("npx", async (logPath) => {
      await withTmpHome(async (home) => {
        await codexAdapter.remove(
          {
            pluginName: "plugin-one",
            repo: "example-user/my-toolkit",
            marketplaceName: "my-toolkit",
            pluginPath: "plugins/plugin-one",
          },
          { home, confirm: async () => true, sourceMode: "marketplace" }
        );

        const log = await readFile(logPath, "utf-8");
        expect(log.trim()).toBe("codex-marketplace remove plugin-one --global");
      });
    });
  });
});

describe("installMarketplace threading pluginPath/sourceMode into Codex", () => {
  async function makeFixtureMarketplace(marketplaceName: string, pluginNames: string[]): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "maui-codex-fixture-marketplace-"));
    await mkdir(join(dir, ".claude-plugin"), { recursive: true });
    await writeFile(
      join(dir, ".claude-plugin", "marketplace.json"),
      JSON.stringify({
        name: marketplaceName,
        owner: { name: "example-user" },
        plugins: pluginNames.map((name) => ({ name, source: `./plugins/${name}`, description: "" })),
      })
    );
    for (const name of pluginNames) {
      await mkdir(join(dir, "plugins", name), { recursive: true });
      await writeFile(
        join(dir, "plugins", name, "maui.json"),
        JSON.stringify({
          name,
          version: "1.0.0",
          targets: {
            codex: { marketplace: true, repo: `example-user/${marketplaceName}` },
          },
        })
      );
    }
    return dir;
  }

  it("each selected plugin gets its own direct-path --plugin install call", async () => {
    await withFakeCli("npx", async (logPath) => {
      await withTmpHome(async (home) => {
        const source = await makeFixtureMarketplace("my-toolkit", ["plugin-one", "plugin-two"]);
        try {
          await installMarketplace(source, { home, allPlugins: true, confirm: async () => true });

          const log = await readFile(logPath, "utf-8");
          const lines = log.trim().split("\n");
          expect(lines).toContain(
            "codex-marketplace add example-user/my-toolkit/plugins/plugin-one --plugin --global"
          );
          expect(lines).toContain(
            "codex-marketplace add example-user/my-toolkit/plugins/plugin-two --plugin --global"
          );
        } finally {
          await rm(source, { recursive: true, force: true });
        }
      });
    });
  });

  it("a single-plugin source still installs by whole-repo path (regression)", async () => {
    await withFakeCli("npx", async (logPath) => {
      await withTmpHome(async (home) => {
        const dir = await mkdtemp(join(tmpdir(), "maui-codex-single-plugin-"));
        await writeFile(
          join(dir, "maui.json"),
          JSON.stringify({
            name: "solo-plugin",
            version: "1.0.0",
            targets: { codex: { marketplace: true, repo: "example-user/solo-plugin" } },
          })
        );
        try {
          await installPlugin(dir, { home, confirm: async () => true });

          const log = await readFile(logPath, "utf-8");
          expect(log.trim()).toBe("codex-marketplace add example-user/solo-plugin --plugin --global");
        } finally {
          await rm(dir, { recursive: true, force: true });
        }
      });
    });
  });
});
