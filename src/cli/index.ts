#!/usr/bin/env bun
import { helpText, knownSubcommand } from "./commands";
import { installPlugin } from "./install";
import { listPlugins } from "./list";

export interface CliResult {
  code: number;
  stdout?: string;
  stderr?: string;
}

async function runInstall(args: string[]): Promise<CliResult> {
  const source = args.find((arg) => !arg.startsWith("--"));
  if (!source) {
    return { code: 1, stderr: "maui install: missing <source> argument" };
  }

  try {
    const result = await installPlugin(source);
    const agentNames = result.agents.map((entry) => entry.agent).join(", ") || "no agents";
    return { code: 0, stdout: `Installed ${result.pluginName} → ${agentNames}` };
  } catch (error) {
    return { code: 1, stderr: `maui install: ${(error as Error).message}` };
  }
}

export async function run(argv: string[]): Promise<CliResult> {
  const [command, ...rest] = argv;

  if (!command || command === "help") {
    return { code: 0, stdout: helpText() };
  }

  if (!knownSubcommand(command)) {
    return { code: 1, stderr: `maui: unknown command "${command}"\n\n${helpText()}` };
  }

  if (command === "install") {
    return runInstall(rest);
  }

  if (command === "list" || command === "status") {
    return { code: 0, stdout: await listPlugins() };
  }

  return { code: 1, stderr: `maui: "${command}" is not implemented yet` };
}

if (import.meta.main) {
  const result = await run(Bun.argv.slice(2));
  if (result.stdout) console.log(result.stdout);
  if (result.stderr) console.error(result.stderr);
  process.exit(result.code);
}
