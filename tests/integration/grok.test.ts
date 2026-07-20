import { describe, it, expect } from "bun:test";
import { mkdtemp, rm, writeFile, chmod, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { grokAdapter } from "../../src/adapters/grok";

async function withFakeGrok(
  scriptBody: string,
  fn: (logPath: string) => Promise<void>
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "maui-fake-grok-"));
  const logPath = join(dir, "invocations.log");
  const scriptPath = join(dir, "grok");
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

describe("grokAdapter.detect", () => {
  it("returns false when grok is not on $PATH", async () => {
    const originalPath = process.env.PATH;
    process.env.PATH = "/nonexistent-maui-test-path";
    try {
      expect(await grokAdapter.detect()).toBe(false);
    } finally {
      process.env.PATH = originalPath;
    }
  });

  it("returns true when a grok binary is on $PATH", async () => {
    await withFakeGrok("#!/bin/sh\nexit 0\n", async () => {
      expect(await grokAdapter.detect()).toBe(true);
    });
  });
});

describe("grokAdapter.install", () => {
  it("installs directly from the plugin's git repo with the required --trust flag", async () => {
    await withFakeGrok('#!/bin/sh\necho "$@" >> "__LOG__"\nexit 0\n', async (logPath) => {
      await grokAdapter.install({
        pluginName: "example-plugin",
        repo: "example-user/example-plugin",
        marketplaceName: "example-plugin",
      });

      const log = await readFile(logPath, "utf-8");
      expect(log.trim()).toBe(
        "plugin install git+https://github.com/example-user/example-plugin --trust"
      );
    });
  });
});

describe("grokAdapter.remove", () => {
  it("runs the uninstall command by plugin name, with no marketplace qualifier", async () => {
    await withFakeGrok('#!/bin/sh\necho "$@" >> "__LOG__"\nexit 0\n', async (logPath) => {
      await grokAdapter.remove({
        pluginName: "example-plugin",
        repo: "example-user/example-plugin",
        marketplaceName: "example-plugin",
      });

      const log = await readFile(logPath, "utf-8");
      expect(log.trim()).toBe("plugin uninstall example-plugin");
    });
  });
});
