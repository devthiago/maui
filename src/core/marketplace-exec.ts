import { $ } from "bun";

export class NativeInstallError extends Error {
  constructor(command: string, stderr: string, exitCode: number) {
    super(`Command failed (exit ${exitCode}): ${command}\n${stderr.trim()}`);
    this.name = "NativeInstallError";
  }
}

export class BinaryNotFoundError extends Error {
  constructor(bin: string) {
    super(`"${bin}" was not found on $PATH`);
    this.name = "BinaryNotFoundError";
  }
}

/**
 * Resolves a binary against the *current* $PATH. Bun.which(bin) with no
 * options (and Bun's $ shell resolving a bare command name) both use a PATH
 * snapshotted at process startup, silently ignoring later
 * process.env.PATH mutations — passing PATH explicitly is the documented
 * way to get a live lookup. This matters both for correctness (a session
 * whose PATH changes after startup) and for testability (tests that
 * prepend a fixture dir to PATH at runtime).
 */
export function resolveBinary(bin: string): string | null {
  return Bun.which(bin, { PATH: process.env.PATH ?? "" });
}

/**
 * Runs a native agent CLI subcommand (e.g. `claude plugin install ...`),
 * returning trimmed stdout on success. Every native-marketplace adapter
 * builds on this rather than shelling out directly, so error handling and
 * output parsing stay in one place.
 */
export async function runNativeCommand(bin: string, args: string[]): Promise<string> {
  const resolved = resolveBinary(bin);
  if (!resolved) {
    throw new BinaryNotFoundError(bin);
  }

  try {
    const result = await $`${resolved} ${args}`.quiet();
    return result.stdout.toString().trim();
  } catch (error) {
    if (error instanceof $.ShellError) {
      const command = [bin, ...args].join(" ");
      throw new NativeInstallError(command, error.stderr.toString(), error.exitCode);
    }
    throw error;
  }
}
