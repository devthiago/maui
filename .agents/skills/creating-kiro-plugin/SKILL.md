---
name: creating-kiro-plugin
description: Distribute steering files to Kiro — .kiro/steering folder conventions, project vs global scope, and how Kiro's steering/specs/hooks system works. Use when packaging files for Kiro or explaining how it reads a shared rules/agents layout.
---

# Distributing files to Kiro

Kiro (AWS's agentic IDE) has **no plugin-install CLI and no manifest
file** — it reads dot-folders directly off disk, same as Cursor/Windsurf.
Its rules-equivalent is called **steering**, and it lives at
`.kiro/steering/` at both project and global scope — unlike Cursor and
Windsurf, Kiro's global rules location *is* a real, symlinkable directory,
not a single file or an app-settings value.

Official reference: [kiro.dev/docs](https://kiro.dev/docs/), specifically
the steering, specs, and hooks guides.

## Folder conventions

| Component | Project scope | Global scope |
|---|---|---|
| Steering (rules-equivalent) | `.kiro/steering/*.md` | `~/.kiro/steering/*.md` |
| Specs (feature planning) | `.kiro/specs/<feature>/` | — (project-scoped only) |
| Hooks (event automation) | `.kiro/hooks/` | — (see Kiro's own docs for global support) |

This skill covers **steering** in depth, since it's the direct
rules/agents-instructions analog and the piece most worth distributing as
a reusable bundle. Specs and hooks are project-specific workflow tools,
not typically something you ship as a redistributable package.

## Steering

**Location**: `.kiro/steering/*.md` (project) or `~/.kiro/steering/*.md`
(global). Plain markdown files — no required frontmatter. Kiro
auto-generates two conventional files when you ask it to set up steering
for a project:

- `product.md` — what the project is, its purpose and users
- `tech.md` — the tech stack and key technical constraints

Beyond those two conventional names, add as many additional `.md` files as
you need — anything in `.kiro/steering/` is loaded as standing guidance,
the same role `CLAUDE.md`/`AGENTS.md`/Cursor rules play elsewhere. There's
no per-file matcher/glob-trigger syntax to write; treat every file here as
always-on context.

```markdown
# tech.md

## Stack
- Bun-only runtime, no Node.js
- bun:test for tests, tsc --noEmit as the only linter

## Conventions
- Prefer Bun.file/Bun.write over node:fs
```

## Specs

**Location**: `.kiro/specs/<feature-name>/`. Kiro's spec-driven workflow
breaks a feature into structured documents (typically a requirements doc,
a design doc, and a task breakdown) that Kiro references while
implementing. These are generated collaboratively per-feature during
development, not something you author up front for distribution — mention
this convention exists, but it isn't a "plugin content" folder the way
steering is.

## Hooks

**Location**: `.kiro/hooks/`. Event-triggered automations that respond to
file changes and other development events (e.g., "run tests when a source
file changes," "update docs when an API file changes"). Distinct from
Claude Code/Codex's `hooks/hooks.json` — Kiro hooks are configured through
its own UI/format; check the current hooks guide at kiro.dev/docs for the
exact file schema before hand-authoring one, since this is the
least-documented of the three components here.

## Publishing checklist

1. Write `.kiro/steering/*.md` with your project's standing guidance —
   this is the piece most worth bundling for reuse.
2. Commit `.kiro/steering/` to the repo for project scope — Kiro reads it
   automatically, no install step.
3. For global/personal distribution, place the same `.md` files under
   `~/.kiro/steering/` — copy or symlink them there, since there's no CLI
   to do this for you.
4. Leave `.kiro/specs/` and `.kiro/hooks/` as project-local, hand-authored
   artifacts rather than trying to ship them generically — they're
   workflow state more than reusable instruction content.

For MCP server configuration and the exact specs/hooks schemas, see
[kiro.dev/docs](https://kiro.dev/docs/).
