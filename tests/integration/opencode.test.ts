import { describe, it, expect } from "bun:test";
import { mkdtemp, rm, writeFile, chmod, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openCodeAdapter, MissingPackageFieldError } from "../../src/adapters/opencode";

async function withFakeOpenCode(
  scriptBody: string,
  fn: (logPath: string) => Promise<void>
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "maui-fake-opencode-"));
  const logPath = join(dir, "invocations.log");
  const scriptPath = join(dir, "opencode");
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

describe("openCodeAdapter.detect", () => {
  it("returns false when opencode is not on $PATH", async () => {
    const originalPath = process.env.PATH;
    process.env.PATH = "/nonexistent-maui-test-path";
    try {
      expect(await openCodeAdapter.detect()).toBe(false);
    } finally {
      process.env.PATH = originalPath;
    }
  });

  it("returns true when an opencode binary is on $PATH", async () => {
    await withFakeOpenCode("#!/bin/sh\nexit 0\n", async () => {
      expect(await openCodeAdapter.detect()).toBe(true);
    });
  });
});

describe("openCodeAdapter.install", () => {
  it("runs `opencode plugin <package> --global` using the manifest's package field", async () => {
    await withFakeOpenCode('#!/bin/sh\necho "$@" >> "__LOG__"\nexit 0\n', async (logPath) => {
      await openCodeAdapter.install({
        pluginName: "example-plugin",
        repo: "example-user/example-plugin",
        marketplaceName: "example-plugin",
        package: "@example/example-plugin",
      });

      const log = await readFile(logPath, "utf-8");
      expect(log.trim()).toBe("plugin @example/example-plugin --global");
    });
  });

  it("throws MissingPackageFieldError when the manifest has no package field", async () => {
    await expect(
      openCodeAdapter.install({
        pluginName: "example-plugin",
        repo: "example-user/example-plugin",
        marketplaceName: "example-plugin",
      })
    ).rejects.toThrow(MissingPackageFieldError);
  });
});

describe("openCodeAdapter.remove", () => {
  it("reports removal as unsupported rather than guessing an unconfirmed command", async () => {
    await expect(
      openCodeAdapter.remove({
        pluginName: "example-plugin",
        repo: "example-user/example-plugin",
        marketplaceName: "example-plugin",
        package: "@example/example-plugin",
      })
    ).rejects.toThrow(/not supported|unsupported/i);
  });
});
