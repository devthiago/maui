import { homedir } from "node:os";
import { readRegistry } from "../core/registry";

export interface ListOptions {
  home?: string;
}

export async function listPlugins(options: ListOptions = {}): Promise<string> {
  const home = options.home ?? homedir();
  const registry = await readRegistry(home);
  const names = Object.keys(registry.plugins);

  if (names.length === 0) {
    return "No plugins installed.";
  }

  const lines = names.map((name) => {
    const entry = registry.plugins[name]!;
    const agents =
      entry.agents.map((agent) => `${agent.agent} (${agent.scope}, ${agent.kind})`).join(", ") ||
      "no agents";
    return `${entry.name}@${entry.version} — ${agents}`;
  });

  return lines.join("\n");
}
