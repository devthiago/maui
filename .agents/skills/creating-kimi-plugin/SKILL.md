---
name: creating-kimi-plugin
description: Create a Kimi Code CLI plugin, or distribute plain skills/agents to it directly — kimi.plugin.json schema, skills/agents folder conventions, hooks, MCP servers, and the marketplace/install model. Use when building or packaging a Kimi Code CLI plugin, writing kimi.plugin.json, or explaining how Kimi discovers skills and agents.
---

# Creating a Kimi Code CLI plugin, or distributing plain skills/agents to it

Kimi Code CLI (Moonshot AI) has **two independent ways** to reach it, and
picking the right one matters:

1. **A managed plugin** — a bundle with a manifest (`kimi.plugin.json`),
   optionally shipping skills, agents, hooks, and MCP servers together,
   installed through Kimi's own plugin/marketplace system.
2. **Plain skills/agents folders** — Kimi independently scans dedicated
   `skills/`/`agents/` directories with no install step and no manifest at
   all, the same "just drop files in a folder" model Cursor/Windsurf/Kiro
   use.

**Kimi's plugin/marketplace management is TUI-only.** Every documented
install/remove/enable/disable operation
(`/plugins install <url>`, `/plugins marketplace add`, `/plugins remove
<id>`, …) is a slash command typed inside a running `kimi` session — there
is no plain shell subcommand like `kimi plugin install` you can script from
outside a session or from CI. If you need scriptable, non-interactive
distribution, route 2 (plain folders) is the one to use; route 1 only
makes sense for content a human installs by hand, interactively.

Official reference: [kimi.com/code/docs/en/kimi-code-cli/customization/](https://www.kimi.com/code/docs/en/kimi-code-cli/customization/plugins.html)
— see the `skills.html`, `agents.html`, `plugins.html`, and `hooks.html`
pages under that path.

## Route 2: plain skills/agents folders (no install step)

Kimi scans several tiers, in priority order (more specific wins):

| Component | Project scope | User/global scope |
|---|---|---|
| Skills | `.kimi-code/skills/`, `.agents/skills/` | `$KIMI_CODE_HOME/skills/` (defaults to `~/.kimi-code/skills/`), `~/.agents/skills/` |
| Agents (subagents) | `.kimi-code/agents/`, `.agents/agents/` | `$KIMI_CODE_HOME/agents/`, `~/.agents/agents/` |
| Context/instructions | `AGENTS.md` at project root | `$KIMI_CODE_HOME/AGENTS.md` (defaults to `~/.kimi-code/AGENTS.md`) |

Extra directories can be added via `extra_skill_dirs`/`extra_agent_dirs` in
`config.toml`. Built-in skills/agents shipped with the CLI have the lowest
priority.

There is **no separate `commands/` folder** — Kimi's customization docs
list only mcp/skills/plugins/datasource/agents/hooks. A flat `.md` file
placed directly inside a skills directory is itself treated as a skill
(this is Kimi's equivalent of a Claude Code "command"); a
subdirectory-with-`SKILL.md` layout and a flat-file layout can coexist in
the same directory, and if a flat `.md` and a subdirectory share a name,
the subdirectory wins (with a logged warning).

### Skills

```markdown
---
name: deploy-staging
description: Deploys the current branch to staging.
---

Instructions for the skill.
```

### Agents (subagents)

Plain markdown with YAML frontmatter, in `agents/*.md`:

```markdown
---
name: security-reviewer
description: Audits a diff for vulnerabilities before merge.
whenToUse: Use before opening a PR that touches auth or data-handling code.
override: false
tools: Read, Grep, Glob
disallowedTools: Write, Edit
subagents: explore
---

System prompt describing the agent's role, expertise, and behavior.
```

| Field | Required | Purpose |
|---|---|---|
| `name` | No | Kebab-case identifier; defaults to the filename |
| `description` | Yes | What the agent does — guides delegation |
| `whenToUse` | No | Additional trigger context |
| `override` | No | Set `true` to replace a built-in agent of the same name |
| `tools` | No | Allowlist of permitted tools |
| `disallowedTools` | No | Denylist of blocked tools |
| `subagents` | No | Which other subagents this one may delegate to |

Kimi ships two built-in subagents, `coder` (general-purpose engineering)
and `explore` (read-only codebase exploration) — a custom agent can
`override: true` either by matching its name.

## Route 1: a managed plugin (`kimi.plugin.json`)

**Location**: `<plugin_root>/kimi.plugin.json`, or
`<plugin_root>/.kimi-plugin/plugin.json` (the flat form takes precedence
if both exist).

```json
{
  "name": "my-plugin",
  "version": "0.1.0",
  "description": "Brief plugin description",
  "author": { "name": "Your Name" },
  "skills": ["./skills/"],
  "commands": ["./commands/"],
  "mcpServers": {
    "docs": { "url": "https://example.com/mcp" }
  },
  "hooks": [
    { "event": "PreToolUse", "matcher": "Bash", "command": "node ./hooks/check-bash.mjs", "timeout": 5 }
  ]
}
```

Required: `name` (must match `[a-z0-9][a-z0-9_-]{0,63}`). Optional
metadata: `version`, `description`, `keywords`, `author`, `homepage`,
`license`, and an `interface` object (`displayName`, `shortDescription`,
`longDescription`, `developerName`, `websiteURL`) for marketplace
presentation. Optional component fields: `skills`/`commands` (paths, must
resolve inside the plugin root), `sessionStart.skill` (a skill to load
automatically at session start), `skillInstructions` (text appended to the
plugin's own skills), `mcpServers`, `hooks`.

Installed plugin files are copied to
`$KIMI_CODE_HOME/plugins/managed/<id>/` — not run in place, similar to how
Claude Code copies marketplace plugins into its own cache.

### Hooks (inside the plugin manifest)

```json
{ "event": "PreToolUse", "matcher": "Bash", "command": "node ./hooks/check-bash.mjs", "timeout": 5 }
```

Confirmed event names include `PreToolUse` and others under the same
lifecycle-event model as Claude Code/Codex, though the full list wasn't
enumerated in the fetched reference — check `hooks.html` directly before
relying on a specific event beyond `PreToolUse`. Hook processes receive
`KIMI_CODE_HOME` and `KIMI_PLUGIN_ROOT` environment variables.

### MCP servers

Declared inline in the manifest's `mcpServers` object — `stdio` form
(`command`/`args`) or remote form (`url`). Enable/disable per-server with
`/plugins mcp enable <plugin-id> <server>` / `/plugins mcp disable ...`.

## Marketplaces

Three source kinds: **Official** (Moonshot-maintained), **Third-party**
(curated publishers), and **Custom** (a URL you point Kimi at yourself).
A custom marketplace is a JSON catalog:

```json
{
  "version": "2",
  "plugins": [
    { "id": "my-plugin", "displayName": "My Plugin", "source": "./my-plugin" }
  ]
}
```

Override the default marketplace with the `KIMI_CODE_PLUGIN_MARKETPLACE_URL`
environment variable. All marketplace browsing/install/enable/disable is,
again, TUI-only (`/plugins marketplace [source]`, `/plugins install
<path-or-url>`) — there's no non-interactive equivalent documented.

## Publishing checklist

**For plain skills/agents (route 2, no install step)**:
1. Write `skills/<name>/SKILL.md` and/or `agents/*.md`.
2. Commit them under `.kimi-code/` (project scope) or place them under
   `~/.kimi-code/` (global scope) — Kimi picks them up automatically, no
   manifest, no install command.

**For a managed plugin (route 1)**:
1. Write `kimi.plugin.json` with at least `name`.
2. Add `skills/`, `mcpServers`, `hooks` as needed.
3. Push to a git repo or a URL reachable by Kimi's installer.
4. Tell users to run `/plugins install <url>` inside a `kimi` session (or
   register it as a custom marketplace source first if you're publishing
   more than one plugin from the same repo).
