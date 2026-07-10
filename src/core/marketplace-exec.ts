import { $ } from "bun";

export class NativeInstallError extends Error {
  constructor(command: string, stderr: string, exitCode: number) {
    super(`Command failed (exit ${exitCode}): ${command}\n${stderr.trim()}`);
    this.name = "NativeInstallError";
  }
}

/**
 * Runs a native agent CLI subcommand (e.g. `claude plugin install ...`),
 * returning trimmed stdout on success. Every native-marketplace adapter
 * builds on this rather than shelling out directly, so error handling and
 * output parsing stay in one place.
 */
export async function runNativeCommand(bin: string, args: string[]): Promise<string> {
  try {
    const result = await $`${bin} ${args}`.quiet();
    return result.stdout.toString().trim();
  } catch (error) {
    if (error instanceof $.ShellError) {
      const command = [bin, ...args].join(" ");
      throw new NativeInstallError(command, error.stderr.toString(), error.exitCode);
    }
    throw error;
  }
}
