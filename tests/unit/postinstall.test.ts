import { describe, it, expect } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { upsertBlock, runHook } from "../../src/core/postinstall";
import type { PostInstallContext } from "../../src/types";

async function withTmpDir(prefix: string, fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("upsertBlock", () => {
  it("inserts a marked block into a new file", async () => {
    await withTmpDir("maui-upsert-", async (dir) => {
      const filePath = join(dir, "CLAUDE.md");
      await upsertBlock(filePath, "example-plugin", "Hello from example-plugin");

      const content = await Bun.file(filePath).text();
      expect(content).toContain("<!-- maui:example-plugin:start -->");
      expect(content).toContain("Hello from example-plugin");
      expect(content).toContain("<!-- maui:example-plugin:end -->");
    });
  });

  it("replaces its own block on a second call rather than duplicating it", async () => {
    await withTmpDir("maui-upsert-", async (dir) => {
      const filePath = join(dir, "CLAUDE.md");
      await upsertBlock(filePath, "example-plugin", "first version");
      await upsertBlock(filePath, "example-plugin", "second version");

      const content = await Bun.file(filePath).text();
      const occurrences = content.split("maui:example-plugin:start").length - 1;
      expect(occurrences).toBe(1);
      expect(content).toContain("second version");
      expect(content).not.toContain("first version");
    });
  });

  it("preserves existing content and other plugins' blocks", async () => {
    await withTmpDir("maui-upsert-", async (dir) => {
      const filePath = join(dir, "CLAUDE.md");
      await Bun.write(filePath, "# My project\n\nSome existing notes.\n");
      await upsertBlock(filePath, "plugin-a", "content from A");
      await upsertBlock(filePath, "plugin-b", "content from B");

      const content = await Bun.file(filePath).text();
      expect(content).toContain("Some existing notes.");
      expect(content).toContain("content from A");
      expect(content).toContain("content from B");
    });
  });
});

describe("runHook", () => {
  const baseContext: PostInstallContext = {
    agent: "claude-code",
    scope: "global",
    scopeRoot: "/home/user/.claude",
    contextFile: "/home/user/.claude/CLAUDE.md",
    pluginDir: "/home/user/.maui/plugins/example-plugin",
    pluginName: "example-plugin",
    version: "1.0.0",
  };

  async function makeScript(dir: string, body: string): Promise<string> {
    const scriptPath = join(dir, "postinstall.ts");
    await writeFile(scriptPath, body);
    return scriptPath;
  }

  it("prompts for consent on first run and does not re-prompt for an unchanged script", async () => {
    await withTmpDir("maui-hook-", async (dir) => {
      await withTmpDir("maui-hook-home-", async (home) => {
        const script = await makeScript(dir, "export default async function () {}\n");

        let promptCount = 0;
        const confirm = async () => {
          promptCount++;
          return true;
        };

        await runHook(script, "example-plugin", baseContext, { home, confirm });
        expect(promptCount).toBe(1);

        await runHook(script, "example-plugin", baseContext, { home, confirm });
        expect(promptCount).toBe(1);
      });
    });
  });

  it("re-prompts when the script's content changes", async () => {
    await withTmpDir("maui-hook-", async (dir) => {
      await withTmpDir("maui-hook-home-", async (home) => {
        const script = await makeScript(dir, "export default async function () {}\n");

        let promptCount = 0;
        const confirm = async () => {
          promptCount++;
          return true;
        };

        await runHook(script, "example-plugin", baseContext, { home, confirm });
        expect(promptCount).toBe(1);

        await writeFile(script, "export default async function () { /* changed */ }\n");
        await runHook(script, "example-plugin", baseContext, { home, confirm });
        expect(promptCount).toBe(2);
      });
    });
  });

  it("does not run the script when consent is declined", async () => {
    await withTmpDir("maui-hook-", async (dir) => {
      await withTmpDir("maui-hook-home-", async (home) => {
        const script = await makeScript(
          dir,
          'export default async function () { throw new Error("should not run"); }\n'
        );

        await expect(
          runHook(script, "example-plugin", baseContext, { home, confirm: async () => false })
        ).rejects.toThrow(/declined/i);
      });
    });
  });

  it("calls the script's default export with context and an upsertBlock api", async () => {
    await withTmpDir("maui-hook-", async (dir) => {
      await withTmpDir("maui-hook-home-", async (home) => {
        const contextFile = join(dir, "CLAUDE.md");
        const script = await makeScript(
          dir,
          'export default async function (ctx, api) { await api.upsertBlock(ctx.contextFile, "block content"); }\n'
        );

        await runHook(
          script,
          "example-plugin",
          { ...baseContext, contextFile },
          { home, confirm: async () => true }
        );

        const content = await Bun.file(contextFile).text();
        expect(content).toContain("block content");
        expect(content).toContain("maui:example-plugin:start");
      });
    });
  });
});
