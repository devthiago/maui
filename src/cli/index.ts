#!/usr/bin/env bun
import { helpText, knownSubcommand } from "./commands";

export interface CliResult {
  code: number;
  stdout?: string;
  stderr?: string;
}

export function run(argv: string[]): CliResult {
  const [command] = argv;

  if (!command || command === "help") {
    return { code: 0, stdout: helpText() };
  }

  if (!knownSubcommand(command)) {
    return { code: 1, stderr: `maui: unknown command "${command}"\n\n${helpText()}` };
  }

  return { code: 1, stderr: `maui: "${command}" is not implemented yet` };
}

if (import.meta.main) {
  const result = run(Bun.argv.slice(2));
  if (result.stdout) console.log(result.stdout);
  if (result.stderr) console.error(result.stderr);
  process.exit(result.code);
}
