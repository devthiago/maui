import { describe, it, expect } from "bun:test";
import { mkdtemp, rm, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  runNativeCommand,
  resolveBinary,
  NativeInstallError,
  BinaryNotFoundError,
} from "../../src/core/marketplace-exec";

async function makeFixtureScript(contents: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "maui-exec-fixture-"));
  const scriptPath = join(dir, "fake-cli.sh");
  await writeFile(scriptPath, contents);
  await chmod(scriptPath, 0o755);
  return scriptPath;
}

describe("runNativeCommand", () => {
  it("returns stdout on success", async () => {
    const script = await makeFixtureScript('#!/bin/sh\necho "hello $1"\nexit 0\n');
    try {
      const output = await runNativeCommand(script, ["world"]);
      expect(output).toBe("hello world");
    } finally {
      await rm(dirname(script), { recursive: true, force: true });
    }
  });

  it("raises NativeInstallError containing the real stderr on non-zero exit", async () => {
    const script = await makeFixtureScript('#!/bin/sh\necho "boom" >&2\nexit 7\n');
    try {
      await expect(runNativeCommand(script, [])).rejects.toThrow(NativeInstallError);
      await expect(runNativeCommand(script, [])).rejects.toThrow(/boom/);
    } finally {
      await rm(dirname(script), { recursive: true, force: true });
    }
  });

  it("raises BinaryNotFoundError for a command that isn't on $PATH", async () => {
    await expect(runNativeCommand("maui-definitely-not-a-real-binary", [])).rejects.toThrow(
      BinaryNotFoundError
    );
  });
});

describe("resolveBinary", () => {
  it("reads $PATH live rather than a value cached at process startup", async () => {
    const dir = await mkdtemp(join(tmpdir(), "maui-exec-path-"));
    const binPath = join(dir, "maui-fixture-bin");
    try {
      await writeFile(binPath, "#!/bin/sh\nexit 0\n");
      await chmod(binPath, 0o755);

      const originalPath = process.env.PATH;
      process.env.PATH = `${dir}:${originalPath}`;
      try {
        expect(resolveBinary("maui-fixture-bin")).toBe(binPath);
      } finally {
        process.env.PATH = originalPath;
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
