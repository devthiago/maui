#!/usr/bin/env bun
import { helpText, knownSubcommand } from "./commands";
import { installFromSource } from "./install";
import { listPlugins } from "./list";
import { removePlugin } from "./remove";
import { linkPlugin } from "./link";
import { unlinkPlugin } from "./unlink";
import { create, createMarketplace, createPlugin } from "./create";
import { updatePlugin, updateAll } from "./update";

export interface CliResult {
  code: number;
  stdout?: string;
  stderr?: string;
}

function parseInstallArgs(args: string[]): {
  source?: string;
  scope: "global" | "project";
  agents?: string[];
  pluginFlags?: string[];
  allPlugins?: boolean;
} {
  let source: string | undefined;
  let scope: "global" | "project" = "global";
  const agents: string[] = [];
  const plugins: string[] = [];
  let allPlugins = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--scope") {
      const value = args[++i];
      if (value === "global" || value === "project") scope = value;
    } else if (arg === "--agent") {
      const value = args[++i];
      if (value) agents.push(value);
    } else if (arg === "--plugin") {
      const value = args[++i];
      if (value) plugins.push(value);
    } else if (arg === "--all-plugins") {
      allPlugins = true;
    } else if (arg && !arg.startsWith("--") && !source) {
      source = arg;
    }
  }

  return {
    source,
    scope,
    agents: agents.length > 0 ? agents : undefined,
    pluginFlags: plugins.length > 0 ? plugins : undefined,
    allPlugins: allPlugins || undefined,
  };
}

async function runInstall(args: string[]): Promise<CliResult> {
  const { source, scope, agents: agentFilter, pluginFlags, allPlugins } = parseInstallArgs(args);
  if (!source && scope !== "project") {
    return { code: 1, stderr: "maui install: missing <source> argument" };
  }

  try {
    const results = await installFromSource(source, {
      scope,
      agents: agentFilter,
      pluginFlags,
      allPlugins,
    });
    const blocks = results.map((result) => {
      const agentNames = result.agents.map((entry) => entry.agent).join(", ") || "no agents";
      const lines = [`Installed ${result.pluginName} → ${agentNames}`];
      if (result.skipped.length > 0) lines.push(`Skipped: ${result.skipped.join(", ")}`);
      if (result.failed.length > 0) lines.push(`Failed: ${result.failed.join(", ")}`);
      return lines.join("\n");
    });
    const anyFailed = results.some((result) => result.failed.length > 0);
    return { code: anyFailed ? 1 : 0, stdout: blocks.join("\n\n") };
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
    const result = await removePlugin(name, { agents, purge });
    const lines = [`Removed ${name}`];
    if (purge) {
      if (result.purged) {
        lines.push("Purged cached source.");
      } else if (result.purgeSkipped) {
        lines.push(`Purge skipped: ${result.purgeSkipped}`);
      }
    }
    return { code: 0, stdout: lines.join("\n") };
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
  const name = args.find((arg) => !arg.startsWith("--"));
  if (!name) {
    return { code: 1, stderr: "maui create: missing <name> argument" };
  }

  try {
    const targetDir = await create(name);
    return { code: 0, stdout: `Created ${targetDir}` };
  } catch (error) {
    return { code: 1, stderr: `maui create: ${(error as Error).message}` };
  }
}

async function runCreatePlugin(args: string[]): Promise<CliResult> {
  const pluginName = args.find((arg) => !arg.startsWith("--"));
  if (!pluginName) {
    return { code: 1, stderr: "maui create-plugin: missing <plugin-name> argument" };
  }

  try {
    const targetDir = await createPlugin(pluginName);
    return { code: 0, stdout: `Created ${targetDir}` };
  } catch (error) {
    return { code: 1, stderr: `maui create-plugin: ${(error as Error).message}` };
  }
}

async function runCreateMarketplace(args: string[]): Promise<CliResult> {
  const marketplaceName = args.find((arg) => !arg.startsWith("--"));
  if (!marketplaceName) {
    return { code: 1, stderr: "maui create-marketplace: missing <marketplace-name> argument" };
  }

  try {
    const targetDir = await createMarketplace(marketplaceName);
    return { code: 0, stdout: `Created ${targetDir}` };
  } catch (error) {
    return { code: 1, stderr: `maui create-marketplace: ${(error as Error).message}` };
  }
}

async function runUpdate(args: string[]): Promise<CliResult> {
  const name = args.find((arg) => !arg.startsWith("--"));

  try {
    const results = name ? [await updatePlugin(name)] : await updateAll();
    if (results.length === 0) {
      return { code: 0, stdout: "No plugins installed." };
    }

    const lines: string[] = [];
    for (const result of results) {
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

  if (command === "create-plugin") {
    return runCreatePlugin(rest);
  }

  if (command === "create-marketplace") {
    return runCreateMarketplace(rest);
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
