---
name: creating-agents-plugin
description: Create a multi-agent plugin or marketplace repo that distributes skills, agents, commands, rules, prompts, and hooks across Claude Code, Codex, Gemini, Grok, Cursor, Windsurf, Kiro, and OpenCode from one shared source layout. Use when starting a new plugin/marketplace repo, or deciding how to structure files so many AI coding tools can consume them.
---

# Creating a multi-agent plugin or marketplace repo

A "plugin" that works across several AI coding agents at once is really
just **one shared set of source folders** (`skills/`, `agents/`,
`commands/`, `rules/`, `prompts/`, `hooks/`) plus **one small manifest per
native tool**, because every tool in this family reads plugin content one
of two ways:

1. **Native-marketplace tools** (Claude Code, Codex, Gemini, Grok) ship
   their own install CLI. It clones or copies your whole repo and reads
   folders by that tool's own default convention — you don't hand-place
   anything, you just make sure the right folders/files exist at the
   right paths and (for Claude/Codex/Gemini) write a small manifest.
2. **File-based tools** (Cursor, Windsurf, Kiro, OpenCode, and the
   generic `.agents/` convention many tools are converging on) have **no
   install CLI at all** — you (or whatever's doing the installing) copy
   or symlink the plugin's files directly into that tool's own
   config folder, at either **project scope** (inside a repo) or
   **global scope** (the user's home directory).

For the exact folder names, manifest schema, and CLI commands **per
tool**, use the matching skill:
[creating-claude-plugin](../creating-claude-plugin/SKILL.md),
[creating-codex-plugin](../creating-codex-plugin/SKILL.md),
[creating-gemini-plugin](../creating-gemini-plugin/SKILL.md),
[creating-grok-plugin](../creating-grok-plugin/SKILL.md),
[creating-cursor-plugin](../creating-cursor-plugin/SKILL.md),
[creating-windsurf-plugin](../creating-windsurf-plugin/SKILL.md),
[creating-kiro-plugin](../creating-kiro-plugin/SKILL.md),
[creating-opencode-plugin](../creating-opencode-plugin/SKILL.md).
This skill covers the parts that are shared across all of them: the
common layout, the safe way to symlink into file-based tools without
clobbering other plugins, and how single-plugin vs. multi-plugin repos
differ.

## The shared source layout

```
my-plugin/
├── skills/       # <name>/SKILL.md — read natively by Claude Code, Codex, Cursor
├── agents/       # <name>.md subagent definitions — Claude Code, Cursor
├── commands/     # flat .md files — Claude Code (legacy), Cursor (legacy)
├── rules/        # standing instructions — Cursor, Windsurf, Kiro (each under its own dot-folder)
├── prompts/      # freeform prompt templates — no single tool reads this by convention; a generic bucket
└── hooks/
    ├── hooks.json         # shared default path for Claude Code AND Codex — same schema, overlapping event names
    └── opencode-hooks.ts  # OpenCode's distinct plugin-loader convention — see creating-opencode-plugin
```

Not every tool reads every folder — see the matrix below. The point of a
shared layout isn't "every tool uses every folder," it's "you write a
skill/rule/hook once, in one place, and each tool's own native discovery
(or your own copy/symlink step) picks up what it understands."

### Per-tool folder support matrix

| Folder | Claude Code | Codex | Gemini | Grok | Cursor | Windsurf | Kiro | OpenCode |
|---|---|---|---|---|---|---|---|---|
| `skills/` | ✅ native | ✅ native | ❌ | ✅ (`.grok/skills/` convention) | ✅ (`.cursor/skills/`) | ❌ | ❌ | ✅ (`.opencode/skills/`) |
| `agents/` | ✅ native | ❌ (no concept) | ❌ | ❌ (unconfirmed) | ✅ (`.cursor/agents/`) | ❌ | ❌ | ✅ (`.opencode/agents/`) |
| `commands/` | ✅ native (legacy) | ❌ (no concept) | ❌ (uses TOML `commands/`, incompatible format) | ❌ | ✅ (`.cursor/commands/`, legacy) | ✅ as `workflows/` (different name/format) | ❌ | ✅ (`.opencode/commands/`) |
| `rules/` | ❌ (no dedicated concept — use skills or `CLAUDE.md`) | ❌ | ❌ (uses `GEMINI.md`) | ❌ | ✅ (`.cursor/rules/`) | ✅ (`.windsurf/rules/`) | ✅ (`.kiro/steering/`) | ✅ (`.opencode/rules/`) |
| `hooks/hooks.json` | ✅ native | ✅ native (currently inert — see creating-codex-plugin) | ❌ | ✅ (`.grok/hooks/` convention, unconfirmed schema match) | ❌ | ❌ | ✅ different concept, `.kiro/hooks/` | ❌ |
| `hooks/opencode-hooks.ts` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (its one specific convention) |

Gaps in this table aren't bugs — they're real differences in what each
tool's agent model supports. Don't force a folder onto a tool that has no
concept for it; skip it instead.

## Two distribution models, in more depth

### Native-marketplace tools install the whole repo themselves

Claude Code, Codex, and Grok clone your repo and read `skills/`,
`agents/` (Claude only), `commands/`, and `hooks/hooks.json` straight from
the copy, using each tool's own default-location discovery — **no
explicit path config needed** as long as your folders match the default
names each tool expects (see the per-tool skills for the exact defaults).
Gemini is the outlier: it has no skills/agents/commands concept at all,
just a `GEMINI.md` context file and TOML `commands/` — treat a Gemini
extension as effectively its own repo/folder rather than trying to fold
it into the same shared layout.

Each of these tools still needs its **own small manifest** at the plugin
root so it can identify the plugin (name, version, description) —
`.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`,
`gemini-extension.json`. Grok has no confirmed manifest file at all; it
discovers plugins purely by folder convention.

### File-based tools need you to place files into their own folder

Cursor, Windsurf, Kiro, and OpenCode have no install CLI. To make a
plugin's content available to one of these, its files need to end up
physically inside that tool's own dot-folder — `.cursor/`, `.windsurf/`,
`.kiro/`, `.opencode/` — either:

- **Project scope**: inside the specific repo/workspace you're working in
  (e.g. `<project>/.cursor/skills/`).
- **Global scope**: in the user's home directory (e.g.
  `~/.cursor/skills/`), available across every project.

The **same "always-on `.agents/` fallback" convention** applies at both
scopes too — a plain `.agents/skills/`, `.agents/commands/`,
`.agents/agents/` structure at either `<project>/.agents/` or
`~/.agents/` — because several tools' own skill/command/agent loaders
(OpenCode's among them) already scan that path by convention on top of
their own dedicated dot-folder. Populating `.agents/` is a good default
safety net: an agent that isn't specifically supported yet, or one whose
detection missed, still has somewhere to find the plugin's files.

### The safe-symlinking rule (why multiple plugins don't clobber each other)

When placing (or symlinking) a plugin's files into a shared destination
like `~/.cursor/skills/` or `~/.agents/skills/`, **the container folder is
always a real directory, and only its immediate children get
symlinked/copied in** — never the container itself:

```
~/.cursor/skills/                          (real directory)
├── code-review/  -> ~/plugin-a/skills/code-review/   (symlink)
└── db-migrate/   -> ~/plugin-b/skills/db-migrate/    (symlink)
```

If you instead symlinked the whole `skills/` folder from one plugin
straight onto `~/.cursor/skills/`, a second plugin that also ships a
`skills/` folder would collide with or shadow the first plugin's content
entirely. Symlinking per-child instead means any number of plugins can
share one destination directory safely, and removing one plugin only
removes the symlinks that plugin owns.

## Single-plugin repos vs. multi-plugin marketplace repos

A repo can either **be** one plugin, or **host** many — pick based on
whether you're shipping one cohesive thing or a catalog of several.

### Single-plugin repo

Everything lives at the repo root: `skills/`, `agents/`, `commands/`,
`rules/`, `prompts/`, `hooks/`, plus each native tool's manifest
(`.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`,
`gemini-extension.json`).

**The self-hosted single-plugin marketplace trick**: Claude Code's
`claude plugin install <name>@<marketplace>` always needs a marketplace to
install *from* — for a single-plugin repo, make the repo its own
marketplace by adding a `.claude-plugin/marketplace.json` that catalogs
itself:

```json
{
  "name": "my-plugin",
  "owner": { "name": "your-github-username" },
  "plugins": [{ "name": "my-plugin", "source": ".", "description": "..." }]
}
```

`source: "."` is a distinct, validated value meaning "the plugin lives at
the marketplace root" (Claude Code v2.1.196+) — this lets
`claude plugin marketplace add <owner>/<repo>` then
`claude plugin install my-plugin@my-plugin` work against your repo
directly, with no separate catalog host needed.

### Multi-plugin marketplace repo

```
my-marketplace/
├── .claude-plugin/
│   └── marketplace.json      # { name, owner, plugins: [{ name, source: "./plugins/<name>", ... }, ...] }
├── .agents/
│   └── plugins/
│       └── marketplace.json  # a second, .agents-convention catalog some tools discover independently
├── gemini-extension.json     # repo-level only — Gemini installs the whole repo as one extension, no per-plugin granularity
└── plugins/
    ├── plugin-one/
    │   ├── .claude-plugin/plugin.json
    │   ├── .codex-plugin/plugin.json
    │   └── skills/ agents/ commands/ rules/ prompts/ hooks/ ...
    └── plugin-two/
        └── ... (same shape)
```

Each plugin subfolder is self-contained — its own manifests, its own
source folders — so adding a new plugin to the catalog is "add a
subfolder and one catalog entry," not "restructure the whole repo."
`.claude-plugin/marketplace.json`'s `plugins` array is what Claude Code
reads; the second `.agents/plugins/marketplace.json` catalog (schema:
`{ name, plugins: [{ name, source }] }`) is a parallel convention some
tooling (including third-party Codex marketplace crawlers) discovers on
its own, nested inside the same `.agents/` folder used for the always-on
fallback above — not a new, unrelated dot-folder.

Only Claude Code and (via its own marketplace-add-then-install flow) Grok
have a real per-plugin marketplace concept. Codex discovers plugins by
crawling `plugins/` directly (no catalog file required for discovery,
though the `.agents/` catalog above still helps other tooling). Gemini
has no per-plugin concept at all — installing the marketplace repo
installs everything in it as one extension, so keep Gemini-targeted
content minimal or skip it for a marketplace repo with several unrelated
plugins.

## Putting it together: creating a new multi-agent plugin, step by step

1. **Decide single-plugin or marketplace.** One cohesive tool → single
   repo. A catalog of several independent things → marketplace repo with
   a `plugins/<name>/` per entry.
2. **Write the shared source folders** — `skills/`, `agents/`,
   `commands/`, `rules/`, `prompts/`, `hooks/` — populating only what
   applies (check the support matrix above; don't force content into a
   folder no target tool reads).
3. **Write one manifest per native-marketplace tool you're targeting**:
   `.claude-plugin/plugin.json` (+ `.claude-plugin/marketplace.json` for
   the self-hosted trick, or the multi-plugin catalog), `.codex-plugin/plugin.json`,
   `gemini-extension.json` if targeting Gemini. Grok needs none.
4. **Add `hooks/hooks.json`** if you need lifecycle behavior in Claude
   Code and/or Codex — one file serves both (see
   [creating-codex-plugin](../creating-codex-plugin/SKILL.md) for the
   event-name overlap and the current Codex runtime caveat).
5. **Add `hooks/opencode-hooks.ts`** if you need event-driven behavior in
   OpenCode specifically — it's a distinct mechanism from `hooks.json`,
   see [creating-opencode-plugin](../creating-opencode-plugin/SKILL.md).
6. **Push to a git repo.** Native-marketplace tools install straight from
   the git URL; file-based tools need their per-tool skill's guidance for
   getting files into `.cursor/`, `.windsurf/`, `.kiro/`, `.opencode/`,
   or the generic `.agents/` fallback, at project or global scope.
7. **Version consistently.** Bump `version` in every manifest you shipped
   together on each release — `.claude-plugin/plugin.json`,
   `.codex-plugin/plugin.json`, `gemini-extension.json`, and (for a
   marketplace) each plugin's own entry in `marketplace.json` — a
   mismatch between a plugin's own manifest version and its marketplace
   catalog entry is confusing for anyone browsing the catalog.
