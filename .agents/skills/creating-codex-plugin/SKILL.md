---
name: creating-codex-plugin
description: Create a Codex CLI plugin or marketplace — .codex-plugin/plugin.json schema, skills/hooks/MCP folder conventions, marketplace registration, and install commands. Use when building or packaging a Codex CLI plugin, writing .codex-plugin/plugin.json, or wiring up plugin hooks.json.
---

# Creating a Codex CLI plugin or marketplace

A Codex plugin bundles **skills**, **hooks**, **MCP servers**, and (for
ChatGPT surfaces) **app connectors** behind one manifest,
`.codex-plugin/plugin.json`. Codex's plugin system deliberately mirrors
Claude Code's shape — same hooks.json schema, overlapping event names — so
if you already know Claude Code plugins, most of this will look familiar.

Official reference:
[developers.openai.com/codex/plugins/build](https://developers.openai.com/codex/plugins/build)
and [developers.openai.com/codex/hooks](https://developers.openai.com/codex/hooks).

## Directory layout

```
my-plugin/
├── .codex-plugin/
│   └── plugin.json          # the only file that belongs in this folder
├── skills/
│   └── my-skill/
│       └── SKILL.md
├── hooks/
│   └── hooks.json           # default path, auto-discovered — no manifest field needed
├── .mcp.json                # MCP server definitions
├── .app.json                # ChatGPT connector config (Work mode / desktop app)
└── assets/                  # icons, screenshots for install-surface presentation
```

Only `plugin.json` goes inside `.codex-plugin/` — `skills/`, `hooks/`,
`.mcp.json`, `.app.json`, and `assets/` all live at the plugin root.

**Codex has no `agents/` or `commands/` manifest concept.** Unlike Claude
Code, there's no subagent-definition folder and no flat-`.md`-command
folder — everything reusable-and-invokable goes under `skills/`.

## `.codex-plugin/plugin.json`

```json
{
  "name": "my-plugin",
  "version": "0.1.0",
  "description": "Brief plugin description",
  "author": { "name": "Your Name", "email": "you@example.com" },
  "license": "MIT",
  "skills": "./skills/"
}
```

Required: `name` (kebab-case), `version`, `description`.

Component pointers (all optional — each has a default folder that's
auto-discovered if omitted):

| Field | Default location | Notes |
|---|---|---|
| `skills` | `./skills/` | Path to skills directory |
| `hooks` | `./hooks/hooks.json` | Path to hooks config, auto-detected; an explicit field overrides it |
| `mcpServers` | `./.mcp.json` | Path to MCP config |
| `apps` | `./.app.json` | ChatGPT connector config |

An `interface` object carries install-surface presentation metadata
(`displayName`, `shortDescription`, `longDescription`, `category`,
`capabilities`, `brandColor`, `logo`, `screenshots`, etc.) shown when the
plugin is browsed in ChatGPT/Codex surfaces — optional, skip it for a
CLI-only plugin.

## Skills

Same `SKILL.md` format as Claude Code: a folder per skill under `skills/`,
frontmatter with `name` + `description`.

```markdown
---
name: my-skill
description: What this does and when to invoke it.
---

Instructions for the skill.
```

## Hooks

**Location**: `hooks/hooks.json`, same shape as Claude Code's:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/script.py",
            "statusMessage": "Checking Bash command",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

**Supported event names** (a strict subset of Claude Code's much larger
list — safe to reuse a hooks.json written for Claude Code as long as you
stick to these): `SessionStart`, `SubagentStart`, `SubagentStop`,
`PreToolUse`, `PermissionRequest`, `PostToolUse`, `PreCompact`,
`PostCompact`, `UserPromptSubmit`, `Stop`.

**Known caveat**: as of this writing there's an open upstream issue
([github.com/openai/codex/issues/16430](https://github.com/openai/codex/issues/16430))
where plugin-bundled `hooks.json` is documented but not yet loaded by the
Codex CLI runtime at install time — only the user's global
`~/.codex/hooks.json` is currently scanned. Ship the file (it's correct per
the docs and forward-compatible), but don't expect it to fire for
plugin-installed users until that lands. In the meantime, hooks placed
directly in `~/.codex/hooks.json` do work.

## MCP servers

**Location**: `.mcp.json` at the plugin root, same shape as Claude Code's
MCP config (`mcpServers` map of server name → `command`/`args`/`env`, or
`url`/`headers` for remote servers).

## Marketplaces and installing

Codex doesn't have a `marketplace.json` catalog file the way Claude Code
does. Instead:

- **Interactively**, inside a Codex session: `/plugins` opens a plugin
  browser where you install/uninstall/enable/disable entries, grouped by
  configured marketplace source.
- **Registering a marketplace source** (a git repo of one or more plugins):
  `codex marketplace add <owner>/<repo>` (also accepts `owner/repo@ref`,
  full git URLs, or a local path). This records the source under
  `[marketplaces.<name>]` in `$CODEX_HOME/config.toml` — you can also hand-edit
  that file instead of using the command.
- **Non-interactive install** (CI, scripting):
  `codex plugin install <owner>/<repo> --non-interactive`, or
  `codex plugin marketplace add <source>` to register-and-track a source
  without touching `config.toml` by hand.
- **Uninstall**: open the plugin from a plugin browser and choose
  "Uninstall plugin", or use the non-interactive CLI equivalent.

Since none of this depends on a repo-level catalog file, a single-plugin
repo just needs `.codex-plugin/plugin.json` at whatever path you point
`codex marketplace add`/`codex plugin install` at — a multi-plugin repo
works the same way, with each plugin in its own subfolder and its own
`.codex-plugin/plugin.json`.

CLI syntax has moved fast — cross-check `codex plugin --help` and
`codex marketplace --help` against the docs above before scripting against
an exact flag.

## Publishing checklist

1. Write `.codex-plugin/plugin.json` with `name`, `version`, `description`.
2. Add `skills/`, `hooks/hooks.json` (optional — remember the runtime
   caveat above), `.mcp.json` as needed.
3. Push to a git repo (GitHub, or any git remote).
4. Register it: `codex marketplace add <owner>/<repo>`, then
   `codex plugin install <name> --non-interactive` (or via `/plugins`
   interactively).
5. Bump `version` on every release.

For ChatGPT-surface distribution (Work mode, desktop app connectors,
composer icons, screenshots), see
[developers.openai.com/codex/plugins/build](https://developers.openai.com/codex/plugins/build)
for the full `interface`/`.app.json` schema — out of scope here.
