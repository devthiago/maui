---
name: creating-claude-plugin
description: Create a Claude Code plugin or plugin marketplace — manifest schema, skills/agents/hooks/MCP folder conventions, marketplace.json catalog shape, and install/publish commands. Use when building or packaging a Claude Code plugin, writing .claude-plugin/plugin.json or marketplace.json, or wiring up plugin hooks.
---

# Creating a Claude Code plugin or marketplace

A Claude Code **plugin** is a self-contained directory of components — skills,
agents, hooks, MCP servers, LSP servers, output styles, themes, monitors —
that extends Claude Code. A **marketplace** is a catalog (`marketplace.json`)
listing one or more plugins, each living in its own subfolder, that users
install from with `claude plugin install`.

Official reference: [code.claude.com/docs/en/plugins-reference](https://code.claude.com/docs/en/plugins-reference).
This skill covers the everyday 90% so you rarely need to leave this file.

## Directory layout

```
my-plugin/
├── .claude-plugin/
│   └── plugin.json          # manifest — optional, but see below
├── skills/                  # skills, each a folder with SKILL.md
│   └── code-reviewer/
│       └── SKILL.md
├── commands/                # skills as flat .md files (legacy-style, still supported)
│   └── deploy.md
├── agents/                  # subagent definitions
│   └── security-reviewer.md
├── hooks/
│   └── hooks.json           # event handlers — default path, no manifest field needed
├── output-styles/
│   └── terse.md
├── themes/
│   └── dracula.json
├── monitors/
│   └── monitors.json
├── .mcp.json                # MCP server definitions
├── .lsp.json                # LSP server configs
├── bin/                     # executables added to the Bash tool's PATH
└── settings.json            # default settings applied when the plugin is enabled
```

**The manifest is optional.** With no `plugin.json`, Claude Code
auto-discovers every folder above by its default location and derives the
plugin's name from the directory name. Add a manifest when you need
metadata (description, author, version) or non-default paths.

`.claude-plugin/` holds only `plugin.json`. Every other folder
(`skills/`, `agents/`, `hooks/`, etc.) lives at the plugin **root**, not
inside `.claude-plugin/`.

## `.claude-plugin/plugin.json`

Only `name` is required (kebab-case, no spaces):

```json
{
  "name": "my-plugin",
  "description": "Brief plugin description",
  "version": "0.1.0",
  "author": { "name": "Your Name", "email": "you@example.com" }
}
```

Unrecognized top-level fields are ignored (not errors), so this file can
double as other tooling's manifest too. Run `claude plugin validate
./my-plugin --strict` in CI to catch typo'd field names before publishing.

### Component path overrides

You only need these if your folders deviate from the defaults above:

| Field | Type | Behavior | Example |
|---|---|---|---|
| `skills` | string\|array | **Adds to** the default `skills/` scan | `"./custom/skills/"` |
| `commands` | string\|array | **Replaces** default `commands/` | `["./cmd1.md", "./cmd2.md"]` |
| `agents` | string\|array | **Replaces** default `agents/` | `"./custom/agents/reviewer.md"` |
| `hooks` | string\|array\|object | Custom path(s), or inline hook config | `"./config/hooks.json"` |
| `mcpServers` | string\|array\|object | Custom path(s), or inline MCP config | `"./mcp-config.json"` |
| `outputStyles` | string\|array | **Replaces** default `output-styles/` | `"./styles/"` |
| `lspServers` | string\|array\|object | Custom path(s) or inline config | `"./.lsp.json"` |

All paths are relative to the plugin root and must start with `./`.

### A single-skill plugin (no `skills/` folder at all)

A `SKILL.md` at the plugin root, with no `skills/` subdirectory and no
`skills` manifest field, auto-loads as a single-skill plugin. Set the
frontmatter `name` field so the skill has a stable invocation name — without
it, Claude falls back to the install directory basename, which for
marketplace installs is a changing version string.

## Skills

**Location**: `skills/<name>/SKILL.md` (directories) or `commands/*.md`
(flat files — use `skills/` for new plugins).

```markdown
---
name: code-reviewer
description: Reviews a diff for correctness, security, and style issues. Use before opening a PR.
---

Detailed instructions for the skill go here.
```

Required frontmatter: `name`, `description`. The `description` is the
routing key Claude matches against to decide when to invoke the skill
automatically — write it as "what it does and when to use it," in words a
user would actually type.

## Agents (subagents)

**Location**: `agents/*.md`, one file per subagent.

```markdown
---
name: security-reviewer
description: Audits code changes for vulnerabilities before merge.
model: sonnet
effort: medium
maxTurns: 20
disallowedTools: Write, Edit
---

System prompt describing the agent's role, expertise, and behavior.
```

Supported frontmatter: `name`, `description`, `model`, `effort`, `maxTurns`,
`tools`, `disallowedTools`, `skills`, `memory`, `background`, `isolation`
(only valid value: `"worktree"`). For security reasons, plugin-shipped
agents cannot declare `hooks`, `mcpServers`, or `permissionMode`.

Once installed, the agent appears in the `@`-mention typeahead as
`<plugin-name>:<agent-name>`.

## Hooks

**Location**: `hooks/hooks.json` (default — no manifest field needed).

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "\"${CLAUDE_PLUGIN_ROOT}\"/scripts/format-code.sh"
          }
        ]
      }
    ]
  }
}
```

Each event maps to an array of `{ matcher, hooks: [...] }` groups. `matcher`
is a regex filtering when the group fires (omit it to match everything for
that event). Each entry in the inner `hooks` array has a `type`:

- `command` — run a shell command/script
- `http` — POST the event JSON to a URL
- `mcp_tool` — call a tool on a configured MCP server
- `prompt` — evaluate a prompt with an LLM (`$ARGUMENTS` placeholder)
- `agent` — run an agentic verifier with tools

**Common event names** (not exhaustive — see the reference doc for the full
~30-event list): `SessionStart`, `SessionEnd`, `UserPromptSubmit`,
`PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `Notification`,
`SubagentStart`, `SubagentStop`, `Stop`, `PreCompact`, `PostCompact`.

Use `${CLAUDE_PLUGIN_ROOT}` (the plugin's install dir — changes on update),
`${CLAUDE_PLUGIN_DATA}` (a persistent dir surviving updates, for installed
deps/caches), and `${CLAUDE_PROJECT_DIR}` (the project root) to reference
paths from a hook command. Quote them in shell-form commands.

## MCP servers

**Location**: `.mcp.json` at the plugin root, or inline via `mcpServers` in
`plugin.json`.

```json
{
  "mcpServers": {
    "my-server": {
      "command": "${CLAUDE_PLUGIN_ROOT}/servers/db-server",
      "args": ["--config", "${CLAUDE_PLUGIN_ROOT}/config.json"]
    }
  }
}
```

## Marketplaces (multi-plugin repos)

A marketplace is a repo whose `.claude-plugin/marketplace.json` catalogs one
or more plugins living in their own subfolders:

```json
{
  "name": "my-marketplace",
  "owner": { "name": "your-github-username" },
  "plugins": [
    { "name": "plugin-one", "source": "./plugins/plugin-one", "description": "..." },
    { "name": "plugin-two", "source": "./plugins/plugin-two", "description": "..." }
  ]
}
```

Each `source` points at a subfolder with its own `.claude-plugin/plugin.json`
and component folders — no nested `marketplace.json`. `source: "."` (or
`"./"` when multiple plugins share the marketplace root, e.g. a shared
`skills/` folder) means "the plugin lives at the marketplace root itself" —
a valid, distinct value, useful for a **self-hosted single-plugin
marketplace**: one repo that is both a plugin and its own marketplace
catalog, letting `claude plugin install my-plugin@my-plugin` work directly
against your repo with no separate catalog host. Requires Claude Code
v2.1.196+; earlier versions only descend into `./plugins/<name>`-style
subfolders and skip a root-level plugin.

## CLI commands

```bash
# Register a marketplace (a git repo with marketplace.json), then install from it
claude plugin marketplace add <owner>/<repo>
claude plugin install <plugin-name>@<marketplace-name> [--scope user|project|local]

# Uninstall
claude plugin uninstall <plugin-name>@<marketplace-name> [--scope ...] [--keep-data] [--prune]

# Enable/disable without uninstalling
claude plugin enable <plugin>@<marketplace> [--scope ...]
claude plugin disable <plugin>@<marketplace> [--scope ...]

# Update
claude plugin update <plugin>@<marketplace>

# Validate a manifest before publishing
claude plugin validate ./my-plugin --strict

# Scaffold a quick local plugin (loads from ~/.claude/skills/<name>/, no marketplace needed)
claude plugin init my-plugin --with skills hooks mcp
```

Scopes: `user` (personal, all projects, default), `project`
(`.claude/settings.json`, shared via version control), `local`
(`.claude/settings.local.json`, gitignored), `managed` (read-only,
org-controlled).

## Publishing checklist

1. `git init` your plugin (or marketplace) repo, no remote required to test
   locally via `--plugin-dir`.
2. Fill in `.claude-plugin/plugin.json` (`name` required; `description`,
   `version`, `author` recommended) and, for a multi-plugin repo,
   `.claude-plugin/marketplace.json` cataloging each plugin subfolder.
3. Run `claude plugin validate ./my-plugin --strict` and fix any warnings.
4. Push to GitHub. Users install with
   `claude plugin marketplace add <owner>/<repo>` then
   `claude plugin install <name>@<repo-name>`.
5. Bump `version` in `plugin.json` (and the marketplace entry's own
   `version`, which is tracked independently) on every release — omitting
   `version` falls back to tracking the git commit SHA, so every commit
   reads as a new version.

For anything not covered here — LSP servers, themes, monitors, user
configuration prompts, channels, dependency declarations between plugins —
see the full reference at
[code.claude.com/docs/en/plugins-reference](https://code.claude.com/docs/en/plugins-reference).
