import { describe, it, expect } from "bun:test";
import { mkdtemp, rm, writeFile, chmod, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../src/adapters/claude-code";

async function withFakeClaude(
  scriptBody: string,
  fn: (logPath: string) => Promise<void>
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "maui-fake-claude-"));
  const logPath = join(dir, "invocations.log");
  const scriptPath = join(dir, "claude");
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

describe("claudeCodeAdapter.detect", () => {
  it("returns false when claude is not on $PATH, regardless of ~/.claude existing", async () => {
    const originalPath = process.env.PATH;
    process.env.PATH = "/nonexistent-maui-test-path";
    try {
      expect(await claudeCodeAdapter.detect()).toBe(false);
    } finally {
      process.env.PATH = originalPath;
    }
  });

  it("returns true when a claude binary is on $PATH", async () => {
    await withFakeClaude("#!/bin/sh\nexit 0\n", async () => {
      expect(await claudeCodeAdapter.detect()).toBe(true);
    });
  });
});

describe("claudeCodeAdapter.install", () => {
  it("runs marketplace add then install, in order, with correct arguments", async () => {
    await withFakeClaude('#!/bin/sh\necho "$@" >> "__LOG__"\nexit 0\n', async (logPath) => {
      await claudeCodeAdapter.install({
        pluginName: "example-plugin",
        repo: "example-user/example-plugin",
        marketplaceName: "example-plugin",
      });

      const log = await readFile(logPath, "utf-8");
      const lines = log.trim().split("\n");
      expect(lines).toEqual([
        "plugin marketplace add example-user/example-plugin",
        "plugin install example-plugin@example-plugin",
      ]);
    });
  });
});

describe("claudeCodeAdapter.remove", () => {
  it("runs the uninstall command with correct arguments", async () => {
    await withFakeClaude('#!/bin/sh\necho "$@" >> "__LOG__"\nexit 0\n', async (logPath) => {
      await claudeCodeAdapter.remove({
        pluginName: "example-plugin",
        repo: "example-user/example-plugin",
        marketplaceName: "example-plugin",
      });

      const log = await readFile(logPath, "utf-8");
      expect(log.trim()).toBe("plugin uninstall example-plugin@example-plugin");
    });
  });
});
