#!/usr/bin/env bun
import { helpText, knownSubcommand } from "./commands";
import { installPlugin } from "./install";
import { listPlugins } from "./list";
import { removePlugin } from "./remove";
import { linkPlugin } from "./link";
import { unlinkPlugin } from "./unlink";
import { createPlugin } from "./create";
import { updatePlugin } from "./update";
import { readRegistry } from "../core/registry";

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
    const lines = [`Installed ${result.pluginName} → ${agentNames}`];
    if (result.skipped.length > 0) lines.push(`Skipped: ${result.skipped.join(", ")}`);
    if (result.failed.length > 0) lines.push(`Failed: ${result.failed.join(", ")}`);
    return { code: result.failed.length > 0 ? 1 : 0, stdout: lines.join("\n") };
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

async function runCreate(args: string[]): Promise<CliResult> {
  const pluginName = args.find((arg) => !arg.startsWith("--"));
  if (!pluginName) {
    return { code: 1, stderr: "maui create: missing <plugin-name> argument" };
  }

  try {
    const targetDir = await createPlugin(pluginName);
    return { code: 0, stdout: `Created ${targetDir}` };
  } catch (error) {
    return { code: 1, stderr: `maui create: ${(error as Error).message}` };
  }
}

async function runUpdate(args: string[]): Promise<CliResult> {
  const name = args.find((arg) => !arg.startsWith("--"));

  try {
    const names = name ? [name] : Object.keys((await readRegistry()).plugins);
    if (names.length === 0) {
      return { code: 0, stdout: "No plugins installed." };
    }

    const lines: string[] = [];
    for (const pluginName of names) {
      const result = await updatePlugin(pluginName);
      const status = result.refreshed ? "refreshed" : "no symlink-cached agents to refresh";
      lines.push(`Updated ${result.pluginName} (${status})`);
      if (result.nativeAgentHints.length > 0) {
        lines.push(...result.nativeAgentHints.map((hint) => `  ${hint}`));
      }
    }
    return { code: 0, stdout: lines.join("\n") };
  } catch (error) {
    return { code: 1, stderr: `maui update: ${(error as Error).message}` };
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

  if (command === "create") {
    return runCreate(rest);
  }

  if (command === "update") {
    return runUpdate(rest);
  }

  return { code: 1, stderr: `maui: "${command}" is not implemented yet` };
}

if (import.meta.main) {
  const result = await run(Bun.argv.slice(2));
  if (result.stdout) console.log(result.stdout);
  if (result.stderr) console.error(result.stderr);
  process.exit(result.code);
}
