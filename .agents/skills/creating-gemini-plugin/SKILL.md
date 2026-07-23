---
name: creating-gemini-plugin
description: Create a Gemini CLI extension — gemini-extension.json schema, GEMINI.md context files, TOML custom commands, and install commands. Use when building or packaging a Gemini CLI extension, writing gemini-extension.json, or adding custom /commands.
---

# Creating a Gemini CLI extension

Gemini CLI calls its plugin unit an **extension**, not a plugin, and it's
structurally simpler and more rigid than Claude Code/Codex plugins: there's
no skills/agents concept, no marketplace catalog, and `gemini extensions
install` always installs the **entire repository** as one unit — there's no
per-plugin granularity inside a Gemini extension repo.

Official reference:
[google-gemini.github.io/gemini-cli/docs/extensions](https://google-gemini.github.io/gemini-cli/docs/extensions/).

## Directory layout

```
my-extension/
├── gemini-extension.json
├── GEMINI.md                 # context file, loaded like a project CLAUDE.md/AGENTS.md
└── commands/
    ├── deploy.toml
    └── gcs/
        └── sync.toml          # nested folder → namespaced command "/gcs:sync"
```

Extensions install to `~/.gemini/extensions/<name>/`.

## `gemini-extension.json`

```json
{
  "name": "my-extension",
  "version": "0.1.0",
  "description": "Brief extension description",
  "contextFileName": "GEMINI.md"
}
```

| Field | Type | Notes |
|---|---|---|
| `name` | string | Lowercase, dashes not spaces — must match the directory name |
| `version` | string | Extension version |
| `contextFileName` | string | Which file holds context/instructions. Defaults to `GEMINI.md` if present |
| `mcpServers` | object | Map of MCP server configs, loaded on startup. A conflicting server in the user's own `settings.json` wins |
| `excludeTools` | array | Tool names to block from the model; supports command-specific restriction syntax, e.g. `"run_shell_command(rm -rf)"` |

There is no `skills`, `agents`, or `hooks` field — Gemini extensions don't
have those concepts. Instructions live in the context file; anything
skill/subagent-shaped has to be expressed as prose in that file instead.

## Context file (`GEMINI.md`)

The equivalent of Claude Code's `CLAUDE.md` or the generic `AGENTS.md`
convention — plain markdown, loaded into context whenever the extension is
active. This is the primary place to put behavioral instructions, since
there's no skills/agents mechanism to split them across.

## Custom commands

**Location**: `commands/*.toml`, one file per command, **TOML format** — not
markdown like every other tool in this family.

```toml
description = "Deploy the current branch to staging"
prompt = "Deploy {{args}} to the staging environment, following the deploy runbook."
```

Nested folders create namespaced commands: `commands/gcs/sync.toml` becomes
`/gcs:sync`.

## Installing, listing, updating

```bash
# Install (from a GitHub URL or local path) — installs the whole repo
gemini extensions install <github-url-or-local-path>

# Uninstall
gemini extensions uninstall <extension-name>

# List (interactive only, inside a Gemini CLI session)
/extensions list

# Enable/disable
gemini extensions enable <extension-name> [--scope=workspace]
gemini extensions disable <extension-name> [--scope=workspace]

# Update
gemini extensions update <extension-name>
gemini extensions update --all

# Scaffold a new extension locally
gemini extensions new <path> <template-type>

# Symlink a local extension directory for active development
gemini extensions link <path>
```

There is **no marketplace/catalog file** and no official extension
registry documented — distribution is "point `gemini extensions install`
at a git URL," full stop. If you want to offer several independently
installable extensions, publish them as **separate repositories** (or
separate top-level extension folders a user installs one at a time by
path) rather than trying to build a Claude-Code-style catalog — Gemini has
no mechanism that would read one.

## Publishing checklist

1. Write `gemini-extension.json` with `name` (matching the directory name),
   `version`, `description`.
2. Add a `GEMINI.md` context file with your instructions.
3. Add `commands/*.toml` for any custom slash commands.
4. Declare `mcpServers` in the manifest if the extension bundles MCP
   servers; use `excludeTools` if it needs to restrict tool access.
5. Push to a git repo. Users run
   `gemini extensions install https://github.com/<owner>/<repo>`.
6. Bump `version` on every release; `gemini extensions update` re-pulls it.

For anything not covered here — extension development templates, linking
for local iteration, exact `excludeTools` restriction syntax — see
[google-gemini.github.io/gemini-cli/docs/extensions](https://google-gemini.github.io/gemini-cli/docs/extensions/).
