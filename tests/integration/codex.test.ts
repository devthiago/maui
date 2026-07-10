import { describe, it, expect } from "bun:test";
import { mkdtemp, rm, writeFile, chmod, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { codexAdapter } from "../../src/adapters/codex";

async function withFakeCli(
  binName: string,
  scriptBody: string,
  fn: (logPath: string) => Promise<void>
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), `maui-fake-${binName}-`));
  const logPath = join(dir, "invocations.log");
  const scriptPath = join(dir, binName);
  await writeFile(scriptPath, scriptBody.replace("__LOG__", logPath));
  await chmod(scriptPath, 0o755);

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
  const home = await mkdtemp(join(tmpdir(), "maui-codex-home-"));
  try {
    await fn(home);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

const identity = {
  pluginName: "example-plugin",
  repo: "example-user/example-plugin",
  marketplaceName: "example-plugin",
};

describe("codexAdapter.detect", () => {
  it("returns false when codex is not on $PATH", async () => {
    const originalPath = process.env.PATH;
    process.env.PATH = "/nonexistent-maui-test-path";
    try {
      expect(await codexAdapter.detect()).toBe(false);
    } finally {
      process.env.PATH = originalPath;
    }
  });

  it("returns true when a codex binary is on $PATH", async () => {
    await withFakeCli("codex", "#!/bin/sh\nexit 0\n", async () => {
      expect(await codexAdapter.detect()).toBe(true);
    });
  });
});

describe("codexAdapter consent", () => {
  it("prompts for consent before the first install, and does not re-prompt afterward", async () => {
    await withFakeCli("npx", '#!/bin/sh\necho "$@" >> "__LOG__"\nexit 0\n', async (logPath) => {
      await withTmpHome(async (home) => {
        let promptCount = 0;
        const confirm = async () => {
          promptCount++;
          return true;
        };

        await codexAdapter.install(identity, { home, confirm });
        expect(promptCount).toBe(1);

        await codexAdapter.install(identity, { home, confirm });
        expect(promptCount).toBe(1);

        const log = await readFile(logPath, "utf-8");
        expect(log.trim().split("\n")).toEqual([
          "codex-marketplace add example-user/example-plugin --plugin --global",
          "codex-marketplace add example-user/example-plugin --plugin --global",
        ]);
      });
    });
  });

  it("does not run the command when consent is declined", async () => {
    await withFakeCli("npx", '#!/bin/sh\necho "$@" >> "__LOG__"\nexit 0\n', async (logPath) => {
      await withTmpHome(async (home) => {
        await expect(
          codexAdapter.install(identity, { home, confirm: async () => false })
        ).rejects.toThrow(/declined/i);

        expect(await Bun.file(logPath).exists()).toBe(false);
      });
    });
  });
});

describe("codexAdapter.remove", () => {
  it("runs the documented remove command with correct flags", async () => {
    await withFakeCli("npx", '#!/bin/sh\necho "$@" >> "__LOG__"\nexit 0\n', async (logPath) => {
      await withTmpHome(async (home) => {
        await codexAdapter.remove(identity, { home, confirm: async () => true });

        const log = await readFile(logPath, "utf-8");
        expect(log.trim()).toBe("codex-marketplace remove example-plugin --global");
      });
    });
  });
});
