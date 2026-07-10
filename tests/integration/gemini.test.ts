import { describe, it, expect } from "bun:test";
import { mkdtemp, rm, writeFile, chmod, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { geminiAdapter } from "../../src/adapters/gemini";

async function withFakeGemini(
  scriptBody: string,
  fn: (logPath: string) => Promise<void>
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "maui-fake-gemini-"));
  const logPath = join(dir, "invocations.log");
  const scriptPath = join(dir, "gemini");
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

describe("geminiAdapter.detect", () => {
  it("returns false when gemini is not on $PATH", async () => {
    const originalPath = process.env.PATH;
    process.env.PATH = "/nonexistent-maui-test-path";
    try {
      expect(await geminiAdapter.detect()).toBe(false);
    } finally {
      process.env.PATH = originalPath;
    }
  });

  it("returns true when a gemini binary is on $PATH", async () => {
    await withFakeGemini("#!/bin/sh\nexit 0\n", async () => {
      expect(await geminiAdapter.detect()).toBe(true);
    });
  });
});

describe("geminiAdapter.install", () => {
  it("runs the confirmed `gemini extensions install <repo>` command", async () => {
    await withFakeGemini('#!/bin/sh\necho "$@" >> "__LOG__"\nexit 0\n', async (logPath) => {
      await geminiAdapter.install({
        pluginName: "example-plugin",
        repo: "https://github.com/example-user/example-plugin",
        marketplaceName: "example-plugin",
      });

      const log = await readFile(logPath, "utf-8");
      expect(log.trim()).toBe("extensions install https://github.com/example-user/example-plugin");
    });
  });
});

describe("geminiAdapter.remove", () => {
  it("reports removal as unsupported rather than guessing an unconfirmed command", async () => {
    await expect(
      geminiAdapter.remove({
        pluginName: "example-plugin",
        repo: "https://github.com/example-user/example-plugin",
        marketplaceName: "example-plugin",
      })
    ).rejects.toThrow(/not supported|unsupported/i);
  });
});
