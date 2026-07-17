# Spec: maui — Global Multi-Agent Toolset Installer

## Objective

`maui` is a CLI that installs "plugins" (skills, agents, commands, hooks,
rules, prompts, MCP configs, etc.) into the right global config location for
whichever AI coding agent/tool is present on the machine — Claude Code,
Cursor, Codex CLI, Gemini CLI, OpenCode, Grok CLI, GitHub Copilot,
Antigravity, Windsurf, Kiro, and any other tool via a generic `.agents`
folder fallback —
without the user ever hand-copying files or hand-running each tool's own
installer.

**User**: a developer who uses multiple AI coding agents and wants one
toolset/plugin installed consistently across all of them, at both machine
(global) and per-project scope.

**Why**: today, adding a skill/agent/command pack to N different tools means
N different manual folder layouts or N different native install flows, done
by hand, repeated on every machine.

**Success looks like**: `maui install <git-url>` detects installed agents and,
per agent, does whichever of the two things is correct for that agent:

- **Agents with their own native plugin/marketplace system** (Claude Code,
  Codex CLI, Gemini CLI, OpenCode, Grok CLI) — maui shells out to that
  tool's own install command. maui never hand-places files for these; the
  native tool owns that.
- **Agents with no native plugin manager** (Cursor, Windsurf, Kiro) — maui
  symlinks the plugin's files into that agent's config folder itself, per
  the plugin's manifest.
- **Always, regardless of the above**: the generic `.agents` global folder
  is populated as a fallback (see **Always-on `.agents` global fallback**).

## Tech Stack

- **Language/runtime**: TypeScript on **Bun**
- **Package manager**: Bun (`bun install`, `bunx`)
- **Distribution**: **Bun-only, deliberately.** maui requires Bun as the
  runtime — the CLI entrypoint's shebang is `#!/usr/bin/env bun`, and
  `core/` uses Bun-native APIs throughout (`Bun.file`, `Bun.write`,
  `Bun.which`, `Bun.$`) rather than `node:fs`/`node:child_process`
  equivalents, since that's what keeps adapters and postinstall scripts
  simple. The package is still published to the npm registry (npm is just
  a package index; Bun installs from it fine), but installing it via
  `npm install -g maui` only fetches the files — running the resulting
  `maui` command still requires Bun to be installed separately. Install
  with `bun install -g maui`, or invoke without installing via `bunx maui`.
  A standalone compiled binary via `bun build --compile` is a nice-to-have,
  not required for v1 (see Open Questions).
- **Test runner**: Bun's built-in test runner (`bun:test`) — no separate test
  framework dependency needed.
- **CLI framework**: TBD in Plan phase (e.g. `commander` or hand-rolled with
  `Bun.argv`) — not a spec-level decision.

## Commands

```
Build:  bun build ./src/cli/index.ts --outdir dist --target bun
Test:   bun test
Test (watch): bun test --watch
Lint:   bun run lint
Dev:    bun run src/cli/index.ts -- <maui-subcommand>
```

`maui` itself (v1 surface):

```
maui install <source> [--agent <agent-name>...] [--scope global|project]
maui list
maui status
maui update [<plugin-name>]
maui remove <plugin-name> [--agent <agent-name>...] [--purge]
maui link <plugin-name> --agent <agent-name> [--scope global|project]
maui unlink <plugin-name> --agent <agent-name> [--scope global|project]
maui create <name>
maui create-plugin <plugin-name>
maui create-marketplace <marketplace-name>
maui help
```

- `<source>` is a git URL (or local path for local dev/testing).
- `--agent` restricts an operation to specific agents; default is "all
  detected" for `install`, "all currently linked/installed" for `remove`.
- `--scope` defaults to `global`; `project` links into the current repo
  instead of the user's home directory. Only meaningful for symlink-adapter
  agents — native-marketplace agents use their own scope flags (see below).
- `--purge` on `remove` also deletes the cached copy under `~/.maui/plugins/`.
- `maui create`/`create-plugin`/`create-marketplace` scaffold a new
  publishable plugin or marketplace repo (see **Plugin Scaffolding** below).

## Agent Adapter Strategies

Every adapter falls into exactly one of two categories. This determines what
`install`/`update`/`remove` actually do for that agent.

| Category | Agents | What `maui install` does | What `maui remove` does |
|---|---|---|---|
| **Native-marketplace** | Claude Code, Codex CLI, Gemini CLI, OpenCode, Grok CLI | Shells out to the agent's own marketplace/extension/plugin CLI, where a scriptable one is confirmed | Shells out to the agent's own uninstall CLI, where one exists |
| **Symlink** | Cursor, Windsurf, Kiro | Symlinks the plugin's mapped files into the agent's config folder | Removes the symlinks maui created |
| **Always-on fallback** | generic `.agents` global folder | Populated on **every** `maui install`, unconditionally — not gated on any agent being detected | Removed alongside the plugin's other links when the plugin is removed |

maui never hand-places files for a native-marketplace agent, and never shells
out to an external installer for a symlink agent.

### Always-on `.agents` global fallback

Every `maui install` also writes the plugin's `_default` mapping into the
global `~/.agents/` folder (per the same "real container, symlinked
children" rule as any other symlink target), **regardless of `--scope` and
regardless of which specific agents were detected on the machine.** This is
a deliberate safety net for "bad installs": an agent that maui misdetects, a
native-marketplace install that fails partway, or a future/unsupported tool
that already follows the emerging `.agents` convention (OpenCode's skill
loader already does, see below) all have a place to find the plugin's files
even when the dedicated adapter path didn't work.

### Detecting whether an agent is present

For a **native-marketplace** adapter, detection must check that the agent's
own CLI binary is actually resolvable on `$PATH` (e.g. `Bun.which("claude")`,
`Bun.which("codex")`, `Bun.which("gemini")`, `Bun.which("opencode")`,
`Bun.which("grok")`) — not
just that a config folder exists. A leftover `~/.claude` directory (e.g.
from dotfile sync) with no `claude` binary installed means maui literally
cannot run `claude plugin install`, so that adapter must report "skipped:
CLI not found" rather than attempting the command and failing.

For a **symlink** adapter, detection falls back to the agent's known global
config folder existing, since several of these tools are GUI-first apps with
no guaranteed CLI on `$PATH`.

### Native-marketplace adapters

- **Claude Code** — non-interactive `claude` CLI subcommands (not the
  interactive `/plugin` slash commands, since maui runs outside a Claude Code
  session):
  - Install: `claude plugin marketplace add <owner>/<repo>` then
    `claude plugin install <plugin-name>@<marketplace-name> [--scope project|user|local]`
  - Remove: `claude plugin uninstall <plugin-name>@<marketplace-name> [--scope ...]`
  - `<marketplace-name>` is the source repo's name unless the plugin's
    `maui.json` overrides it. This requires the plugin repo to carry a
    `.claude-plugin/marketplace.json` that catalogs itself (the scaffold in
    **Plugin Scaffolding** generates this) — verify this "self-hosted
    single-plugin marketplace" pattern during Plan-phase research.
- **Codex CLI** — via the third-party `codex-marketplace` tool
  (`npx codex-marketplace`, see codex-marketplace.com/docs). **Note:** unlike
  Claude Code's first-party `claude` CLI, this is an unofficial, third-party
  dependency maui shells out to — flagged as a supply-chain consideration in
  Boundaries.
  - Install: `npx codex-marketplace add <owner>/<repo> --plugin [--global|--project]`
  - Remove: `npx codex-marketplace remove <plugin> [--global|--project]`
- **Gemini CLI** — official `gemini extensions` CLI
  (geminicli.com/docs/extensions):
  - Install: `gemini extensions install https://github.com/<owner>/<repo>`
  - Remove: exact uninstall syntax wasn't confirmed from docs during spec
    research (only `list` and `install` were documented) — verify
    `gemini extensions uninstall <name>` during Plan phase before relying on
    it.
- **OpenCode** — official `opencode plugin` CLI (opencode.ai/docs/cli):
  - Install: `opencode plugin <module> [--global]` (`--global`/`-g` for
    global scope, otherwise project scope; `--force`/`-f` to replace an
    existing version). `<module>` is a package specifier
    (`@scope/plugin-name`) — OpenCode plugins are JS/TS npm packages, not git
    repos, so a maui plugin needs to actually be published to npm under that
    name for this adapter to work. `maui.json` needs a `package` identity
    field for this (see Manifest below).
  - Remove: **no CLI uninstall verb is documented** for `opencode plugin` —
    see Open Questions. maui may need to fall back to editing the `plugin`
    array in `opencode.json`/`~/.config/opencode/opencode.json` directly, or
    simply report to the user that this must be removed manually.
  - OpenCode plugins are hook/behavior code only — they don't carry skills.
    Skills reach OpenCode entirely through the always-on `.agents/skills/`
    fallback above: OpenCode's own skill loader already searches
    `.agents/skills/<name>/SKILL.md` (project) and
    `~/.agents/skills/<name>/SKILL.md` (global) as one of its native lookup
    paths (confirmed in opencode.ai/docs/skills), so maui doesn't need a
    dedicated OpenCode skills target at all.
- **Grok CLI** — non-interactive `grok` CLI subcommands, confirmed via
  docs.x.ai/build/cli/reference (mirrors Claude Code's shape closely):
  - Marketplace: `grok plugin marketplace <list|add|remove|update>`
  - Plugin: `grok plugin <list|install|uninstall|update|enable|disable|details|validate>`
  - Install: `grok plugin marketplace add <source>` then
    `grok plugin install <plugin-name>` (or `<plugin-name>@<marketplace>`,
    matching Claude Code's shape — see below)
  - Remove: `grok plugin uninstall <plugin-name>`
  - The reference page names these subcommands but doesn't spell out
    argument formats (owner/repo shorthand vs. full git URL for
    `marketplace add`; whether `install`/`uninstall` need a
    `<name>@<marketplace>` qualifier like Claude Code's; exact scope flags).
    Confirm via `grok plugin --help` / `grok plugin marketplace --help`
    during Plan-phase implementation — this is a small syntax check, not a
    structural uncertainty (see Open Questions).
  - Also file-based (background, from docs.x.ai/build/features/skills-plugins-marketplaces):
    plugins live in `~/.grok/plugins/` (global) / `./.grok/plugins/`
    (project); marketplace sources track in `~/.grok/config.toml`
    `[[marketplace.sources]]` and `~/.grok/plugins/known_marketplaces.json`.
    Management is also exposed via a TUI (`/plugins`, `/hooks`, `/skills`,
    `/mcps` inside a `grok` session) — maui uses the shell subcommands
    above, not the TUI.
  - Grok's skills are also discovered from plain folders (`./.grok/skills/`,
    `~/.grok/skills/`), but — unlike OpenCode — nothing checked so far
    confirms Grok reads from `.agents/skills/`. Don't assume the always-on
    `.agents` fallback reaches Grok's skill loader until verified.

### Symlink adapters

- **Cursor, Windsurf, Kiro** — dedicated adapters per their own folder
  conventions (exact paths are an existing open question, see below).
- **Generic `.agents` fallback** — the always-on adapter described above;
  also what any detected-but-otherwise-unlisted agent effectively gets.

### Symlinking rule: only final files/folders, never the parent

For every symlink adapter, the destination **container** folder (`skills/`,
`agents/`, `commands/`, `rules/`, `prompts/`, `plugins/`, etc.) is always a
**real directory** that maui creates with `mkdir -p` if missing — maui never
symlinks that container itself. Inside it, maui symlinks each **immediate
child** of the source folder individually (each skill's subfolder, each
agent's `.md` file, each command file, each rule file, ...).

This is deliberate: if the container itself were a symlink, a second plugin
that also ships a `skills/` folder would collide with or shadow the first
plugin's entire directory. Per-child symlinking lets any number of plugins
contribute into the same shared container without conflicting with each
other — only individual same-named children can conflict, which is exactly
the granularity the backup-on-conflict rule (see Boundaries) operates at.

```
~/.claude/skills/                 (real dir, created by maui if missing)
  code-review/  -> ~/.maui/plugins/plugin-a/skills/code-review/   (symlink)
  db-migrate/   -> ~/.maui/plugins/plugin-b/skills/db-migrate/    (symlink)
```

## Project Structure

### maui's own repository

```
src/
  cli/                 → command definitions (install, list, update, remove, link/unlink, create)
  core/
    registry.ts         → reads/writes ~/.maui/registry.json (installed plugin state)
    fetch.ts             → git clone/pull into ~/.maui/plugins/<name>
    manifest.ts           → parses & validates a plugin's maui.json
    linker.ts              → creates/removes per-child symlinks, handles conflict backup
    marketplace-exec.ts     → shells out to native CLIs (claude/codex-marketplace/gemini) and parses their output/exit codes
    context-file.ts           → resolves the per-adapter `contextFile` path (CLAUDE.md, GEMINI.md, AGENTS.md fallback, ...)
    postinstall.ts              → runs a plugin's postinstall/postremove script, provides the `upsertBlock` helper, tracks written blocks for auto-cleanup
    scaffold.ts                   → implements `create`/`create-plugin`/`create-marketplace`
  adapters/
    claude-code.ts       → native-marketplace adapter
    codex.ts               → native-marketplace adapter
    gemini.ts                → native-marketplace adapter
    opencode.ts                → native-marketplace adapter
    grok.ts                      → native-marketplace adapter (arg format TBD, see Open Questions)
    cursor.ts
    windsurf.ts
    kiro.ts
    generic-agents.ts        → `.agents/<subfolder>` always-on fallback
  types.ts
tests/
  unit/                 → manifest parsing, path resolution, registry read/write
  integration/           → full install/link/remove flow against a fixture $HOME, plus
                            marketplace-exec tests using a fake `claude`/`gemini`/`npx` on $PATH
docs/
  adapters.md             → per-agent folder convention / native-CLI reference
SPEC.md
```

### Runtime state (on the user's machine)

```
~/.maui/
  plugins/<plugin-name>/     → cached git clone of the plugin source (source of truth for symlinks;
                                 unused for native-marketplace-only plugins, which the native tool caches itself)
  registry.json                → installed plugins: source, version/commit, which agents each is
                                   active on (symlinked vs. native-installed), linked scopes
  config.json                   → maui's own config (default agents, adapter overrides)

<project-root>/.maui/
  config.json                   → which plugins are linked into *this* project, committable so a team shares the same set
```

## Plugin Manifest (`maui.json`, lives at the root of a plugin's source repo)

Two kinds of entries under `targets`, matching the two adapter categories:

- **Symlink-target agents**: explicit source path → destination *container*
  path (relative to that agent's config root). maui creates the container
  and symlinks each child in it per the rule above.
- **Native-marketplace agents**: no file paths — just enough identity for
  maui to build the install/remove command. `repo` defaults to the plugin's
  own git origin; `plugin`/`marketplace` names default to `maui.json`'s
  `name` field and can be overridden.

```json
{
  "name": "example-plugin",
  "version": "1.0.0",
  "description": "Example skill pack",
  "targets": {
    "claude-code": { "marketplace": true },
    "codex": { "marketplace": true },
    "gemini": { "marketplace": true },
    "opencode": { "marketplace": true, "package": "@example/example-plugin" },
    "grok": { "marketplace": true },
    "cursor": {
      "cursor-rules/": ".cursor/rules/"
    },
    "windsurf": {
      "skills/": ".windsurf/skills/"
    },
    "_default": {
      "skills/": "skills/",
      "commands/": "commands/"
    }
  },
  "postinstall": "postinstall.ts",
  "postremove": "postremove.ts"
}
```

- `_default` maps into the always-on global `.agents/` fallback (e.g.
  `skills/` above lands at `~/.agents/skills/`) — this runs on every
  install unconditionally, not just for unlisted/undetected agents (see
  **Always-on `.agents` global fallback** above).
- `opencode`'s `package` field is the npm specifier maui hands to
  `opencode plugin <module>`; it must correspond to a package actually
  published to npm, since OpenCode installs plugins as npm dependencies, not
  from a git source. This is a real gap for a git-source-first tool like
  maui — flagged in Open Questions.
- Adapters own *detection* (how maui knows an agent is present) and the
  *root* each relative dest path is resolved against, or (for
  native-marketplace agents) how to construct that agent's install/remove
  command; the manifest only owns the relative mapping or the `marketplace`
  identity overrides.

## Postinstall & Postremove Hooks

A plugin may optionally declare a `postinstall` script, a `postremove`
script, both, or neither in `maui.json` — most plugins that only ship files
(skills, agents, commands, ...) need neither, and installing them never
triggers a consent prompt. A plugin declares one to do more than place
files — e.g. add a note to the agent's context/memory file after installing.
When present, `postinstall` runs for **every** agent+scope pairing maui
successfully installed into, native-marketplace or symlink alike (even
though maui didn't place the files itself for a native-marketplace agent, it
still knows the install succeeded and which agent/scope it was for).

```json
{
  "postinstall": "postinstall.ts",
  "postremove": "postremove.ts"
}
```

Both fields are optional; omit either (or both) if a plugin doesn't need
them.

### What the script receives

```typescript
interface PostInstallContext {
  agent: string;        // adapter id, e.g. "claude-code", "gemini", "_default"
  scope: "global" | "project";
  scopeRoot: string;     // resolved root for this agent+scope, e.g. ~/.claude or <project>/.gemini
  contextFile: string;    // best-known "memory" markdown file for this agent+scope (see below)
  pluginDir: string;       // ~/.maui/plugins/<name> — the cached plugin source
  pluginName: string;
  version: string;
}
```

`maui` resolves `contextFile` per adapter so plugin authors don't hardcode
per-agent filenames themselves:

| Agent | Global | Project | Status |
|---|---|---|---|
| Claude Code | `~/.claude/CLAUDE.md` | `<project>/CLAUDE.md` | confirmed (code.claude.com/docs/en/memory) |
| Gemini CLI | `~/.gemini/GEMINI.md` | `<project>/GEMINI.md` | global confirmed; project assumed by symmetry, verify |
| Codex, OpenCode, Grok, Cursor, Windsurf, Kiro | — | — | unconfirmed, research during Plan phase (see Open Questions) |
| generic `.agents` fallback | `~/AGENTS.md` | `<project>/AGENTS.md` | maui's own convention, always available as the fallback `contextFile` when an adapter has no known one |

Note Claude Code explicitly does **not** read `AGENTS.md` on its own — if a
plugin wants Claude Code to see AGENTS.md content, its `postinstall` should
target the Claude-specific `contextFile` (`CLAUDE.md`), not assume the
`.agents` fallback file reaches it.

### Idempotency and clean removal

`contextFile`s are **shared, user-owned files** — many plugins (and the user)
may write to the same `CLAUDE.md`. A `postinstall` that blindly appends text
would duplicate content on every `update` and leave orphaned content behind
after `remove`, which conflicts with the "never destroy/leave orphaned user
data" principle. So:

- `postinstall` scripts must write into `contextFile` via a maui-provided
  `upsertBlock(contextFile, content)` helper, which wraps `content` in
  `<!-- maui:<plugin-name>:start -->` / `<!-- maui:<plugin-name>:end -->`
  markers and replaces its own previous block in place on re-runs (so
  `update` is idempotent).
- maui tracks, per plugin, every `contextFile` path a block was written into
  (in `~/.maui/registry.json`). On `remove`, maui strips that plugin's
  marked block from each tracked file automatically — **even if the plugin
  didn't define a `postremove` script.** `postremove` is only needed for
  cleanup beyond a marked block (e.g. undoing some other side effect).

### Trust model

Postinstall/postremove scripts run as plain Bun/TS with the user's full
filesystem permissions — there is no OS-level sandbox in v1, so "trust" here
means informed consent, not containment:

- The first time a plugin declaring `postinstall`/`postremove` is installed,
  maui shows the script's path/source and asks for confirmation before
  running it (see Boundaries).
- If `update` pulls a new commit where the postinstall/postremove script's
  content changed, maui re-prompts — a changed script is a new trust
  decision, not a continuation of the old one.

## Plugin Scaffolding (`maui create`, `maui create-plugin`, `maui create-marketplace`)

Three commands, because a repo can either *be* one plugin, or *host* many.
Trying to force both shapes through one command is what made adding a
second plugin to an existing repo a manual, error-prone exercise before —
these all reference the real-world shape confirmed against
[wshobson/agents](https://github.com/wshobson/agents), a working multi-harness
plugin marketplace repo, rather than an invented layout.

**Shared design point**: everything generated here is meant to work with
each agent's own *native* install command with maui never in the loop
(`claude plugin marketplace add`, `gemini extensions install`, etc.) — not
just as input to `maui install`. Single-plugin repos are the exception:
those still generate `maui.json` too, since a lone plugin repo is small
enough that both paths make sense to support at once.

### `maui create-plugin <plugin-name>` — scaffolds one plugin

Detects context by checking for `./.claude-plugin/marketplace.json` in the
current working directory:

**Not found → standalone mode** (identical to the single-plugin scaffold
this project already had): prompts for GitHub username/org, description,
license; creates `<plugin-name>/` with the common shared source folders
(`skills/`, `agents/`, `commands/`, `rules/`, `prompts/`, `hooks/`, each with
a `.gitkeep`); generates `.claude-plugin/plugin.json` +
`.claude-plugin/marketplace.json` (self-hosted single-plugin marketplace,
now including an `owner: { name: <githubUser> }` field, confirmed present in
real marketplace.json files) + `.codex-plugin/plugin.json` +
`gemini-extension.json` + `maui.json` (targets pre-wired: `marketplace: true`
for claude-code/codex/gemini, symlink mappings for cursor/windsurf/kiro/
`_default`) + `package.json` with a `version:bump` script that updates
`version` across all five files in one step. `git init`, no remote, no push.

**Found → marketplace mode**: creates `plugins/<plugin-name>/` inside the
existing repo, containing only `.claude-plugin/plugin.json`,
`.codex-plugin/plugin.json`, and the common source folders — **no**
`marketplace.json`, `gemini-extension.json`, or `maui.json` in the plugin
folder itself, since those are repo-level and already exist (this is the
literal fix for "adding another plugin forces manual effort"). It then:

- **Appends** an entry to the existing root `.claude-plugin/marketplace.json`'s
  `plugins` array: `{ name, source: "./plugins/<name>", description,
  version, author }`.
- **Appends** a matching entry to `.agents/plugins/marketplace.json`'s
  `plugins` array, if that file exists (see `create-marketplace` below).
- Generates its own `package.json` + `scripts/bump-version.ts`, scoped to
  just this plugin: bumps `package.json`, `.claude-plugin/plugin.json`, and
  `.codex-plugin/plugin.json` — **and** updates this plugin's own entry
  (matched by `name`) inside the shared root `.claude-plugin/marketplace.json`
  and `.agents/plugins/marketplace.json`, so the marketplace catalog's
  per-plugin version never drifts from the plugin's own manifest. Does not
  touch the marketplace's own `metadata.version` — that's
  `create-marketplace`'s script's job, since the marketplace and each
  plugin it lists are independently versioned (confirmed in the reference
  repo: marketplace-level `1.7.1` vs. one plugin at `1.2.3`).

### `maui create-marketplace <marketplace-name>` — scaffolds the repo shell

Prompts for GitHub username/org, description, license. Creates
`<marketplace-name>/` with:

```
<marketplace-name>/
├── .git/                          git init, no remote, no commits
├── .claude-plugin/
│   └── marketplace.json            { name, owner: { name: githubUser }, metadata: { description, version: "0.1.0" }, plugins: [] }
├── .agents/
│   └── plugins/
│       └── marketplace.json         { name, plugins: [] } — see note below
├── gemini-extension.json           { name, version: "0.1.0", description, contextFileName: "AGENTS.md" }
├── plugins/
│   └── .gitkeep                    populated later by create-plugin
├── package.json
└── scripts/
    └── bump-version.ts              bumps package.json, .claude-plugin/marketplace.json's metadata.version,
                                       gemini-extension.json's version, and .agents/plugins/marketplace.json's
                                       version if that key is present (it isn't guaranteed to be — see note)
```

**Why `gemini-extension.json` lives here, not per-plugin**: confirmed
against the reference repo — Gemini has no marketplace/per-plugin install
concept, so `gemini extensions install <repo-url>` installs the *entire*
repo as one extension. A per-plugin `gemini-extension.json` would have
nothing that could install it independently, so it belongs at the
marketplace level, generated once.

**`.agents/plugins/marketplace.json` note**: this file is a second,
`.agents`-convention manifest also found in the reference repo, nested
inside the `.agents/` folder maui already treats as the always-on symlink
fallback — not a new sibling dot-folder. Its schema differs from
`.claude-plugin/marketplace.json`: object-form
`"source": { "source": "local", "path": "./plugins/<name>" }` instead of a
plain string, plus `policy.installation`/`policy.authentication` and
`category` fields on each entry. Those extra fields are **not confirmed as
an official standard** — only observed in this one real-world repo — so
maui's generator treats `name`/`plugins`/`source` as the only required
shape and leaves `policy`/`category` out unless later confirmed elsewhere.

### `maui create <name>`

Thin dispatcher, not a third independent implementation:

1. Prompts: "Is this a single-plugin repo or a multi-plugin marketplace repo?"
2. **Single** → calls `create-plugin <name>` in standalone mode (identical
   result to running `create-plugin` directly in an empty directory).
3. **Multi** → calls `create-marketplace <name>`. Does **not** also create a
   first plugin automatically — the user runs `create-plugin` afterward
   (from inside the new directory) to add one, which is then detected in
   marketplace mode per above.

## Code Style

```typescript
// adapters/claude-code.ts
export const claudeCodeAdapter: NativeMarketplaceAdapter = {
  id: "claude-code",
  kind: "native-marketplace",
  detect: async () => Bun.which("claude") !== null,
  install: async (plugin) =>
    run("claude", ["plugin", "marketplace", "add", plugin.repo]).then(() =>
      run("claude", ["plugin", "install", `${plugin.name}@${plugin.marketplace}`])
    ),
  remove: async (plugin) =>
    run("claude", ["plugin", "uninstall", `${plugin.name}@${plugin.marketplace}`]),
};
```

- One adapter per file under `src/adapters/`, implementing either the
  `SymlinkAdapter` or `NativeMarketplaceAdapter` interface — the `kind` field
  makes the category explicit at the type level, not just by convention.
- No adapter reaches into another adapter's paths or shells out on another
  adapter's behalf — all cross-agent orchestration lives in `core/`.
- Prefer small, named functions over inline logic in CLI command handlers;
  command files stay thin and delegate to `core/`.
- Explicit error types (`ManifestValidationError`, `LinkConflictError`,
  `NativeInstallError`, etc.) over generic `Error` throws, since CLI output
  needs to tell the user exactly what went wrong (including surfacing a
  failed native CLI's stderr) and how to recover.

## Testing Strategy

- **Framework**: Bun's built-in test runner (`bun:test`).
- **Unit tests** (`tests/unit/`): manifest parsing/validation, per-adapter
  path resolution, registry read/write round-trips, per-child symlink
  planning (given a source folder listing, what individual links should
  result). No filesystem side effects beyond an isolated tmp dir.
- **Integration tests** (`tests/integration/`):
  - Symlink adapters: drive the real `install` / `link` / `update` /
    `remove` flow against a fixture `$HOME` with fake agent folders
    pre-created, asserting the actual per-child symlinks created/removed and
    the backup behavior on conflict — including the multi-plugin-sharing-one-
    container case.
  - Native-marketplace adapters: stub `claude`/`gemini`/`npx` as fake
    executables on a fixture `$PATH` that record invocation args, asserting
    maui constructs the right command/flags and correctly surfaces a
    non-zero exit as an install/remove failure.
  - Postinstall/postremove: a fixture plugin whose `postinstall` calls
    `upsertBlock` on a fixture `contextFile`, asserting the block appears
    once, re-running `install`/`update` doesn't duplicate it, and `remove`
    strips it cleanly even with no `postremove` defined. Also assert the
    first-run confirmation prompt fires, and that changing the script's
    content triggers re-confirmation on the next `update`.
- **Coverage expectation**: `core/` and `adapters/` at ~90%+; CLI argument
  parsing may be lighter since it's mostly framework glue.
- Every new adapter ships with at least one integration test proving its
  install → (linked path or native-installed) → remove round-trips cleanly.

## Boundaries

- **Always do**:
  - Detect agents before acting; only touch agents actually present (skip
    silently, report what was skipped). For native-marketplace agents,
    "present" means the agent's own CLI binary resolves on `$PATH` — a
    config folder existing is not sufficient, since maui can't run
    `claude`/`codex`/`gemini`/`opencode`/`grok` commands without the binary.
  - Populate the global `~/.agents/` fallback on every install, unconditionally,
    regardless of `--scope` or which specific agents were detected.
  - For symlink adapters: cache plugin source once under
    `~/.maui/plugins/<name>`; every agent link is a symlink back to that
    cache, never a copy. Symlink only final files/folders inside a real
    container directory, never the container itself.
  - For native-marketplace adapters: only ever call that agent's own
    documented install/uninstall commands — never hand-place files into
    paths owned by Claude Code's/Codex's/Gemini's own plugin cache.
  - Auto-backup any pre-existing, non-maui-owned file/folder at a symlink
    target path (rename to `<name>.maui-backup-<timestamp>`) before placing
    a symlink there — never silently destroy user data.
  - Record every install/link/unlink in `~/.maui/registry.json` (and the
    project's `.maui/config.json` for project scope), including which
    agents were handled via native marketplace vs. symlink, so
    `list`/`status` are always accurate.
  - Validate a plugin's `maui.json` against a schema before touching the
    filesystem or shelling out to any native CLI; refuse to install on
    invalid manifests.
  - Surface a native CLI's own error output verbatim on failure rather than
    swallowing it.
  - Run a plugin's `postinstall` once per successfully-installed agent+scope
    pairing, and its `postremove` before removing that pairing's other
    artifacts; write to `contextFile`s only via the marker-block
    `upsertBlock` helper (never freeform edits) so removal can always find
    and strip what was added (see **Postinstall & Postremove Hooks**).
- **Ask first**:
  - Removing a plugin's cached copy (`--purge`) when it's still linked into
    one or more symlink agents.
  - Installing from a source without a `maui.json` at all (offer to treat
    the whole repo as a generic `.agents/`-fallback bundle, but confirm).
  - Adding a new required runtime dependency to maui itself.
  - Shelling out to the third-party `codex-marketplace` tool the first time
    (it's not an OpenAI-official CLI) — confirm the user is fine with maui
    invoking an unofficial dependency on their behalf.
  - Running a plugin's `postinstall`/`postremove` script for the first time
    (show its source/path before running); re-confirm whenever `update`
    pulls a version where that script's content changed.
- **Never do**:
  - Overwrite a symlink or file maui didn't create without going through the
    backup step above.
  - Modify files *inside* an agent's own reserved config (e.g.
    `~/.claude/settings.json`) — maui only manages the plugin
    directories/files a manifest declares, never shared config files. A
    plugin's `contextFile` edits are a deliberate, narrow exception to this
    — but only via marker-delimited `upsertBlock` writes, never freeform
    edits to the rest of the file.
  - Symlink a container folder (`skills/`, `agents/`, etc.) itself — only
    its individual children.
  - Auto-push, auto-commit, or auto-create a GitHub remote for a
    `maui create`-scaffolded repo — that's the user's own git workflow.
  - Run a `postinstall`/`postremove` script without the user's up-front
    confirmation (see Ask First) — installing a plugin's *files* never
    requires consent beyond the initial `maui install`, but installing a
    plugin's *code execution* always does.

## Success Criteria

- `maui install <git-url>` on a machine with Claude Code and Cursor installed
  results in: Claude Code getting the plugin via
  `claude plugin marketplace add` + `claude plugin install`, and Cursor
  getting correctly-linked per-child symlinks in `~/.cursor/...` — with a
  clear summary printed showing which path was used per agent.
- Two different plugins that both ship a `skills/` folder can be installed
  into the same agent without either clobbering the other's skills.
- `maui install <git-url>` always populates `~/.agents/...` per the plugin's
  `_default` mapping, even on a machine where every single dedicated adapter
  is undetected — a completely "unsupported" machine still ends up with the
  plugin's files discoverable at a predictable path.
- On a machine with OpenCode installed (`opencode` on `$PATH`) and the
  plugin published to npm with a matching `package` field, `maui install`
  runs `opencode plugin <package> --global`; the plugin's skills still reach
  OpenCode via the always-on `.agents/skills/` fallback even though
  OpenCode's own plugin CLI never touches skills.
- `maui update <name>` pulls the latest commit into the shared cache (for
  symlink agents) and every previously-linked agent reflects the change with
  no re-linking needed; for native-marketplace agents, `update` defers to
  that agent's own update mechanism (e.g. `claude plugin marketplace
  update`).
- `maui remove <name>` removes all per-child symlinks for that plugin across
  every linked symlink agent, and runs the native uninstall command for
  every native-marketplace agent it was installed on.
- Running `maui install` twice for the same plugin/agent is idempotent (no
  duplicate links, no error, no duplicate native-install call).
- A conflicting pre-existing file at a target path is backed up (never lost)
  and the install still succeeds.
- `maui install <git-url> --scope project` links only into the current
  project's local agent folders (e.g. `./.claude`) for symlink agents and
  records the choice in `<project>/.maui/config.json`, committable so
  teammates get the same setup via `maui install` (no args) reading that
  file.
- `maui create-plugin my-plugin` produces a repo that, once pushed to
  GitHub, can be installed via `claude plugin marketplace add
  <user>/my-plugin` + `claude plugin install my-plugin@my-plugin` with no
  further manual editing.
- `maui create-marketplace my-marketplace` followed by two separate
  `maui create-plugin` runs from inside that directory produces a repo where
  both plugins are independently installable via
  `claude plugin install <plugin-name>@my-marketplace` — with **zero**
  manual edits to `.claude-plugin/marketplace.json` required to add the
  second plugin, which is the entire point of splitting `create` into three
  commands.
- A plugin with a `postinstall.ts` that calls
  `upsertBlock(ctx.contextFile, "...")` results in that block landing in
  `~/.claude/CLAUDE.md` when installed for Claude Code, `~/.gemini/GEMINI.md`
  for Gemini, and `~/AGENTS.md` for any agent with no known `contextFile`
  convention — with the user prompted once before the script first runs.
  Running `maui remove` on that plugin strips the block from every file it
  was written to, with no leftover content and no `postremove` script
  required.

## Open Questions

1. Exact global/project folder conventions for Cursor, Windsurf, and Kiro
   still need to be researched and encoded per-adapter during the
   Plan/Implement phase (`source-driven-development` — verify against each
   tool's own docs). GitHub Copilot and Antigravity additionally need a
   decision on whether they get a dedicated adapter or fall through to the
   generic `.agents` fallback for v1.
2. Confirm the exact `gemini extensions uninstall` syntax (not found in the
   pages fetched during spec research) before implementing the Gemini
   adapter's `remove`.
2a. No `opencode plugin` uninstall verb was found in OpenCode's CLI docs
    either. Decide during Plan phase whether maui edits `opencode.json`'s
    `plugin` array directly for removal (a narrow, install-mechanism-owned
    exception to the "never touch an agent's own config" boundary) or simply
    tells the user to remove it by hand.
2b. OpenCode installs plugins as npm packages (`opencode plugin
    @scope/name`), not from git — meaning a maui plugin author must
    separately publish to npm for the OpenCode adapter to work at all. This
    is a real distribution gap worth surfacing to plugin authors (e.g. in
    `create-plugin`'s generated README/docs) rather than silently failing.
2c. Grok CLI's `grok plugin marketplace add|remove` and
    `grok plugin install|uninstall` are confirmed to exist
    (docs.x.ai/build/cli/reference), but the reference page doesn't spell
    out argument formats — confirm via `--help` before implementing
    `grok.ts`: does `marketplace add` take `owner/repo` shorthand like
    Claude Code, or does it need a full URL? Do `install`/`uninstall` need a
    `<name>@<marketplace>` qualifier, or just `<name>`? What are the
    scope flags (global/project equivalent)? Also unconfirmed: whether
    Grok's skill loader reads `.agents/skills/` the way OpenCode's does —
    don't rely on the always-on `.agents` fallback reaching Grok until
    verified.
3. Confirm the "self-hosted single-plugin marketplace" pattern (a repo
   containing both `.claude-plugin/plugin.json` and a self-cataloging
   `.claude-plugin/marketplace.json`) is actually valid for
   `claude plugin marketplace add` — the scaffold in **Plugin Scaffolding**
   depends on it.
4. Should v1 ship with a small built-in registry/index of known-good
   symlink-adapter plugins, or is "any git URL with a `maui.json`"
   sufficient to start? (Spec assumes the latter.)
5. Versioning/pinning: should `maui.json` support a pinned git ref (tag/commit)
   distinct from "always track latest" for symlink-adapter plugins, and does
   `update` need a `--check`/dry-run mode before mutating the cache?
6. `bun build --compile` standalone-binary distribution — worth offering
   alongside the npm-registry package in v1, or defer?
7. CLI argument-parsing library choice — deferred to the Plan phase, not a
   spec-level decision.
8. `contextFile` conventions for Codex, OpenCode, Grok, Cursor, Windsurf, and
   Kiro are unconfirmed — research each during the Plan phase alongside
   Open Question #1's folder-convention research. Also confirm Gemini's
   project-scope `<project>/GEMINI.md` (only the global path was verified).
   Until confirmed, those adapters' `postinstall` context should fall back
   to the generic `.agents` convention's `contextFile`
   (`AGENTS.md`) rather than guessing a tool-specific filename.
