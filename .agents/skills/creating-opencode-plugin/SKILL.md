---
name: creating-opencode-plugin
description: Distribute skills/commands/agents to OpenCode and write OpenCode plugin event handlers — .opencode folder conventions, the plugins/ TypeScript loader, and how OpenCode "plugins" relate to Claude Code/Codex hooks. Use when packaging files for OpenCode or writing an OpenCode plugin.
---

# Distributing files to OpenCode, and writing OpenCode plugins

OpenCode has **no plugin-install CLI** — it's file-based, like
Cursor/Windsurf/Kiro. But it also has a second, unrelated meaning of
"plugin" that's easy to conflate with the others: OpenCode's own
`plugins/` folder holds TypeScript **event handlers**, not skill/command
bundles. Read that literally: OpenCode's "plugins" are conceptually much
closer to what Claude Code calls **hooks** (`PreToolUse`, `PostToolUse`,
`Stop`, …) than to a Claude Code or Codex "plugin." This skill covers both
halves, since they're independent and both optional.

Official reference: [opencode.ai/docs/plugins](https://opencode.ai/docs/plugins/),
[/docs/skills](https://opencode.ai/docs/skills/),
[/docs/commands](https://opencode.ai/docs/commands/),
[/docs/agents](https://opencode.ai/docs/agents/).

## Two independent pieces

1. **Files** — `skills/`, `commands/`, `agents/`, `rules/` — plain folders,
   symlinked or copied per-child into OpenCode's config directory, exactly
   like Cursor/Windsurf/Kiro. No install CLI, no manifest.
2. **Plugin hooks** — a single TypeScript file exporting event handlers,
   discovered by OpenCode's own plugin loader at startup. This is the
   piece that plays the same role Claude Code's `hooks/hooks.json` or
   Codex's `hooks.json` play, just implemented as executable TypeScript
   instead of declarative JSON.

## Folder conventions (files)

| Component | Project scope | Global scope |
|---|---|---|
| Skills | `.opencode/skills/` | `~/.config/opencode/skills/` |
| Commands | `.opencode/commands/` | `~/.config/opencode/commands/` |
| Agents | `.opencode/agents/` | `~/.config/opencode/agents/` |
| Rules | `.opencode/rules/` | `~/.config/opencode/rules/` |
| Plugin hooks (TS) | `.opencode/plugins/<name>.ts` | `~/.config/opencode/plugins/<name>.ts` |

Skills, commands, and agents follow OpenCode's own documented per-file
conventions (see the docs links above for the exact frontmatter each
expects — it's close to, but not guaranteed identical to, Claude Code's
`SKILL.md`/agent frontmatter shape).

**Detecting OpenCode**: unlike Cursor/Windsurf/Kiro, OpenCode is CLI-first
— check whether the `opencode` binary resolves on `$PATH`, not just
whether a `~/.config/opencode` folder exists (a stray leftover config
folder proves nothing about whether OpenCode itself is actually
installed).

## Plugin hooks (TypeScript)

**Location**: a single `.ts` file under `plugins/`, named after your
plugin/tool (`<name>.ts`) — that exact filename is what OpenCode's loader
looks for at startup, so if you're packaging this for reuse, keep the
source file at a fixed, known name (e.g. `opencode-hooks.ts`) and rename
it to match the target name when you place it in `plugins/`.

```typescript
import type { Plugin } from "@opencode-ai/plugin";

export const MyPlugin: Plugin = async ({ project, client, $, directory, worktree }) => {
  return {
    "tool.execute.before": async (input, output) => {
      if (input.tool === "read" && output.args.filePath.includes(".env")) {
        throw new Error("Do not read .env files");
      }
    },
  };
};
```

Add `@opencode-ai/plugin` as a dependency (`^1.18.3` or later) for the
`Plugin` type. See
[opencode.ai/docs/plugins/#create-a-plugin](https://opencode.ai/docs/plugins/#create-a-plugin)
for the complete list of events and their payload shapes.

### Mapping a Claude Code/Codex hook to an OpenCode plugin event

Conceptual mapping only — exact payload shapes and firing semantics differ
per tool, so treat this as a starting point, not a drop-in translation:

| Claude Code / Codex hook | Fires | Closest OpenCode plugin event |
|---|---|---|
| `PreToolUse` | Before a tool call executes | `"tool.execute.before"` |
| `PostToolUse` | After a tool call succeeds | `"tool.execute.after"` |
| `SessionStart` | When a session begins or resumes | `"session.created"` |
| `SessionEnd` | When a session terminates | `"session.deleted"` |
| `Notification` | When the CLI sends a notification | `"tui.toast.show"` |
| `PermissionRequest` | When a permission dialog appears | `"permission.asked"` |
| `Stop` | When the agent finishes responding | `"session.idle"` |

## Publishing checklist

1. Write `.opencode/skills/`, `.opencode/commands/`, `.opencode/agents/`
   as needed — same per-child-folder convention as any other file-based
   tool.
2. If you need event-driven behavior (not just static skills/commands),
   write a single plugin TypeScript file with your handlers, and add
   `@opencode-ai/plugin` to your `package.json`.
3. For project distribution: commit `.opencode/` (files) and place the
   plugin file at `.opencode/plugins/<name>.ts` — OpenCode picks both up
   automatically, no install step.
4. For global distribution: place the same folders under
   `~/.config/opencode/`, with the plugin file at
   `~/.config/opencode/plugins/<name>.ts`.
5. Keep the plugin file's exported name and the target filename aligned
   with your tool's name — OpenCode's loader identifies a plugin by the
   file it finds in `plugins/`, not by an internal manifest.

For the full skills/commands/agents frontmatter schemas and the complete
plugin event list, see [opencode.ai/docs](https://opencode.ai/docs/).
