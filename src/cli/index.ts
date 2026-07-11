#!/usr/bin/env bun
import { helpText, knownSubcommand } from "./commands";
import { installPlugin } from "./install";
import { listPlugins } from "./list";
import { removePlugin } from "./remove";
import { linkPlugin } from "./link";
import { unlinkPlugin } from "./unlink";

export interface CliResult {
  code: number;
  stdout?: string;
  stderr?: string;
}

function parseInstallArgs(args: string[]): { source?: string; scope: "global" | "project" } {
  let source: string | undefined;
  let scope: "global" | "project" = "global";

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--scope") {
      const value = args[++i];
      if (value === "global" || value === "project") scope = value;
    } else if (arg && !arg.startsWith("--") && !source) {
      source = arg;
    }
  }

  return { source, scope };
}

async function runInstall(args: string[]): Promise<CliResult> {
  const { source, scope } = parseInstallArgs(args);
  if (!source && scope !== "project") {
    return { code: 1, stderr: "maui install: missing <source> argument" };
  }

  try {
    const result = await installPlugin(source, { scope });
    const agentNames = result.agents.map((entry) => entry.agent).join(", ") || "no agents";
    return { code: 0, stdout: `Installed ${result.pluginName} → ${agentNames}` };
  } catch (error) {
    return { code: 1, stderr: `maui install: ${(error as Error).message}` };
  }
}

function parseRemoveArgs(args: string[]): { name?: string; agents?: string[]; purge: boolean } {
  let name: string | undefined;
  const agents: string[] = [];
  let purge = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--purge") {
      purge = true;
    } else if (arg === "--agent") {
      const value = args[++i];
      if (value) agents.push(value);
    } else if (arg && !arg.startsWith("--") && !name) {
      name = arg;
    }
  }

  return { name, agents: agents.length > 0 ? agents : undefined, purge };
}

async function runRemove(args: string[]): Promise<CliResult> {
  const { name, agents, purge } = parseRemoveArgs(args);
  if (!name) {
    return { code: 1, stderr: "maui remove: missing <plugin-name> argument" };
  }

  try {
    await removePlugin(name, { agents, purge });
    return { code: 0, stdout: `Removed ${name}` };
  } catch (error) {
    return { code: 1, stderr: `maui remove: ${(error as Error).message}` };
  }
}

function parseNameAndAgentArgs(args: string[]): { name?: string; agent?: string } {
  let name: string | undefined;
  let agent: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--agent") {
      agent = args[++i];
    } else if (arg && !arg.startsWith("--") && !name) {
      name = arg;
    }
  }

  return { name, agent };
}

async function runLink(args: string[]): Promise<CliResult> {
  const { name, agent } = parseNameAndAgentArgs(args);
  if (!name || !agent) {
    return { code: 1, stderr: "maui link: usage: maui link <plugin-name> --agent <agent-name>" };
  }

  try {
    await linkPlugin(name, agent);
    return { code: 0, stdout: `Linked ${name} → ${agent}` };
  } catch (error) {
    return { code: 1, stderr: `maui link: ${(error as Error).message}` };
  }
}

async function runUnlink(args: string[]): Promise<CliResult> {
  const { name, agent } = parseNameAndAgentArgs(args);
  if (!name || !agent) {
    return { code: 1, stderr: "maui unlink: usage: maui unlink <plugin-name> --agent <agent-name>" };
  }

  try {
    await unlinkPlugin(name, agent);
    return { code: 0, stdout: `Unlinked ${name} from ${agent}` };
  } catch (error) {
    return { code: 1, stderr: `maui unlink: ${(error as Error).message}` };
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

  if (command === "remove") {
    return runRemove(rest);
  }

  if (command === "link") {
    return runLink(rest);
  }

  if (command === "unlink") {
    return runUnlink(rest);
  }

  return { code: 1, stderr: `maui: "${command}" is not implemented yet` };
}

if (import.meta.main) {
  const result = await run(Bun.argv.slice(2));
  if (result.stdout) console.log(result.stdout);
  if (result.stderr) console.error(result.stderr);
  process.exit(result.code);
}
