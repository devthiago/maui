---
name: creating-windsurf-plugin
description: Distribute rules and workflows to Windsurf (Cascade) — .windsurf/rules, .windsurf/workflows folder conventions, project vs global scope, and how Windsurf/Cascade reads them. Use when packaging files for Windsurf or explaining how it reads a shared rules/commands layout.
---

# Distributing files to Windsurf (Cascade)

Windsurf's AI agent, Cascade, has **no plugin-install CLI and no manifest
file** — like Cursor, it reads dot-folders directly off disk. Windsurf's
component set is narrower than Cursor's or Claude Code's: there's no
confirmed `skills/` or `agents/`(subagent) folder convention — just
**rules** and **workflows**.

Official reference: search "Windsurf rules" / "Windsurf workflows" at the
current Windsurf/Cascade docs (the product has moved between
`docs.windsurf.com` and `docs.devin.ai` following the Devin/Cognition
merge — confirm the live URL before citing it, since the docs host has
changed more than once).

## Folder conventions

| Component | Project scope | Global scope | Format |
|---|---|---|---|
| Rules | `.windsurf/rules/*.md` (a folder of files), or a single `.windsurf/rules.md` | `~/.codeium/windsurf/memories/global_rules.md` — a single file, not a directory | Plain markdown |
| Workflows | `.windsurf/workflows/*.md` | — (not confirmed at global scope) | Plain markdown, invoked as `/workflow-name` |

Project-scope rules and workflows are committed to git and shared with the
team. The global rules file is singular — there's nothing to "install," a
user edits (or you help them append to) that one file directly, rather
than dropping in a folder of separate files the way you would for
project scope.

## Rules

**Location**: `.windsurf/rules/` (preferred for anything non-trivial — one
file per concern) or a single `.windsurf/rules.md` for small projects.
Cascade includes rule content in every prompt automatically — there's no
matcher/glob-triggering frontmatter to write, unlike Cursor's `.mdc`
format; treat each file as always-on guidance.

```markdown
# Testing conventions

- Use bun:test, not jest or vitest.
- Prefer real fixtures over mocks.
```

Plain markdown with section headings — no required frontmatter.

**Global scope** is the single file
`~/.codeium/windsurf/memories/global_rules.md` — append to it rather than
dropping in a new file, since Cascade only reads that one path.

## Workflows

**Location**: `.windsurf/workflows/*.md` — Windsurf's equivalent of a
custom slash command. Create one markdown file per workflow; the filename
(minus extension) becomes the invocation name, run in Cascade as
`/workflow-name`.

```markdown
# Deploy to staging

1. Run the test suite and confirm it's green.
2. Build the release artifact.
3. Push to the staging environment and tail logs for 60 seconds.
```

Workflows are step-by-step procedures for Cascade to follow when invoked —
there's no special frontmatter schema; write them as clear, ordered
instructions.

## Rules vs. Memories

Don't confuse **Rules** (what you distribute — static, authored,
version-controlled) with **Memories** (dynamic context Cascade learns
during a session and persists on its own). Memories aren't something you
author for distribution; they're specific to a user's own working history
with the project.

## Publishing checklist

1. Write `.windsurf/rules/*.md` (or a single `.windsurf/rules.md`) with
   your project's standing instructions.
2. Write `.windsurf/workflows/*.md` for any repeatable, invokable
   procedures.
3. Commit `.windsurf/` to the repo — Cascade picks it up automatically,
   no install step, no manifest.
4. For content a user wants across every project rather than just this
   repo, point them at appending to their own
   `~/.codeium/windsurf/memories/global_rules.md` — there's no
   distributable-folder equivalent at global scope to symlink into.

There's no skills/agents/hooks mechanism to reach for beyond the two
folders above — if you need subagent-style task delegation or event hooks
in Windsurf specifically, that's not currently a documented capability;
double-check the live docs before assuming otherwise, since Windsurf's
feature set has been expanding quickly.
