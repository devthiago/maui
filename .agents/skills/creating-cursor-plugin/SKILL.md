---
name: creating-cursor-plugin
description: Distribute skills, subagents, rules, and (legacy) commands to Cursor — .cursor/skills, .cursor/agents, .cursor/rules, .cursor/commands folder conventions, project vs global scope, and how Cursor discovers them. Use when packaging files for Cursor or explaining how Cursor reads a shared skills/agents/rules layout.
---

# Distributing files to Cursor

Cursor has **no plugin-install CLI and no manifest file** — there's nothing
to `cursor install`. Instead, Cursor reads several dot-folders directly off
disk, at either **project scope** (checked into the repo, `.cursor/...`) or
**global/user scope** (personal, `~/.cursor/...`). Ship the same directory
names in a distributable bundle and dropping (or symlinking) it into either
location is enough — no packaging step required.

Official reference: [cursor.com/docs](https://cursor.com/docs) — start at
[cursor.com/docs/context/rules](https://cursor.com/docs/context/rules) and
[cursor.com/docs/skills](https://cursor.com/docs/skills).

## Folder conventions

| Component | Project scope | Global scope | Format |
|---|---|---|---|
| Skills | `.cursor/skills/<name>/SKILL.md` (anywhere in the repo tree — monorepo-friendly) | `~/.cursor/skills/<name>/SKILL.md` | Directory with `SKILL.md`, same shape as Claude Code |
| Subagents | `.cursor/agents/*.md` | `~/.cursor/agents/*.md` | Markdown, YAML frontmatter + system prompt |
| Rules | `.cursor/rules/*.mdc` (subfoldable) | Cursor Settings → Rules (not a filesystem folder) | `.mdc` (markdown + frontmatter) |
| Commands (legacy) | `.cursor/commands/*.md` | `~/.cursor/commands/*.md` | Flat markdown, invoked as `/name` |

A plain `AGENTS.md` at the project root (or nested in subdirectories, no
frontmatter needed) is also read as a simpler rules alternative when you
don't need per-rule metadata.

## Skills

**This is the current, recommended mechanism** — Cursor is actively
migrating users off legacy slash commands onto skills (there's a built-in
`/migrate-to-skills` flow). Skills follow the open Agent Skills standard,
the same `SKILL.md` shape used by Claude Code, so a skill written for one
is generally portable to the other without changes:

```markdown
---
name: deploy-staging
description: Deploys the current branch to the staging environment. Use when asked to deploy, ship, or push to staging.
---

Step-by-step instructions for the skill.
```

Two required frontmatter fields: `name` (must match the containing folder
name) and `description` (the routing key Cursor's agent matches against to
decide when to auto-apply it — write it the way a user would phrase the
request). Invoke explicitly with `/skill-name` in chat, `@skill-name` to
attach as context, or let the agent auto-apply it based on the description.

A `.cursor/skills/` folder is picked up **anywhere inside the repository**,
not just at the root — colocate a skill with the package/module it applies
to in a monorepo. Use `~/.cursor/skills/` for skills you want personally,
across every project, without checking them into any particular repo.

## Subagents

**Location**: `.cursor/agents/*.md` (project, committed) or
`~/.cursor/agents/*.md` (global, personal).

```markdown
---
name: security-reviewer
description: Audits a diff for vulnerabilities before merge.
model: sonnet
readonly: false
is_background: false
---

System prompt describing the subagent's role and behavior.
```

Cursor's primary agent dispatches independent subagents for discrete
subtasks, each with its own context window — useful for decomposing large
refactors into parallel, tree-structured work. Optional frontmatter beyond
the above includes `tools`, `disallowedTools`, and `permissionMode`.

## Rules

**Location**: `.cursor/rules/*.mdc` (project scope, version-controlled,
can be organized in subfolders). Global "User Rules" are stored in
Cursor's own settings/database, not a filesystem folder — there's no
`~/.cursor/rules/` directory to write to; if you need rule-like content to
ship for every project without per-repo setup, an `AGENTS.md`-based
convention or a documented manual settings step is the only option, not a
distributable file.

`.mdc` format: markdown body with YAML frontmatter controlling when the
rule applies (glob patterns, "always apply," or description-triggered).
See the official rules doc for the exact frontmatter schema — it's
distinct from the skill/agent frontmatter shape above.

## Commands (legacy)

**Location**: `.cursor/commands/*.md`, flat files, invoked as `/name`.
Cursor's own docs now frame these as the predecessor to skills — new work
should prefer `.cursor/skills/`, but existing `.cursor/commands/` content
still works and both user-level and workspace-level commands keep their
explicit `/name` invocation behavior after migrating.

## Publishing checklist

1. Decide project vs. global scope per component (skills and agents
   support both; rules are project-only via the filesystem).
2. Write `SKILL.md` files under `.cursor/skills/`, agent definitions under
   `.cursor/agents/`, and `.mdc` rules under `.cursor/rules/` as needed.
3. Commit `.cursor/` to the repo for project scope — no build step, no
   manifest, no install command. Cursor picks these up on the next
   session/reload.
4. For global/personal distribution, place the same folder shapes under
   `~/.cursor/` (skills, agents) — copy or symlink them there since there's
   no CLI to do it for you.

For anything not covered here — MCP server config
(`.cursor/mcp.json`), background agents, or the exact `.mdc` rule
frontmatter schema — see [cursor.com/docs](https://cursor.com/docs).
