export const COMMANDS = [
  "install <source> [--agent <agent-name>...] [--scope global|project]",
  "list",
  "status",
  "update [<plugin-name>]",
  "remove <plugin-name> [--agent <agent-name>...] [--purge]",
  "link <plugin-name> --agent <agent-name> [--scope global|project]",
  "unlink <plugin-name> --agent <agent-name> [--scope global|project]",
  "create <plugin-name>",
  "help",
];

const KNOWN_SUBCOMMANDS = new Set(COMMANDS.map((command) => command.split(" ")[0]));

export function knownSubcommand(name: string): boolean {
  return KNOWN_SUBCOMMANDS.has(name);
}

export function helpText(): string {
  const lines = [
    "maui — Global Multi-Agent Toolset Installer",
    "",
    "Usage:",
    ...COMMANDS.map((command) => `  maui ${command}`),
  ];
  return lines.join("\n");
}
