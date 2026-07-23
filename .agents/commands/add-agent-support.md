---
description: Research an AI coding agent's plugin/extension system and add maui support for it — a new adapter, scaffold wiring, tests, and a creating-<agent>-plugin skill. No-ops if the agent is already supported.
argument-hint: [agent-name] [docs-url-or-hint]
disable-model-invocation: true
---

# Add maui support for a new agent

Arguments: `$ARGUMENTS` — an agent/tool name (e.g. `zed`, `aider`, `amp`),
optionally followed by a URL or hint pointing at its official docs. If no
docs URL is given, find the official documentation yourself before doing
anything else — don't guess folder conventions or CLI syntax from
half-memory.

## Step 0 — check whether it's already supported

Before anything else, check both of these:

- `src/adapters/registry.ts` — is there already an entry for this agent's
  id (case-insensitively, and checking for obvious aliases — e.g. "vscode
  copilot" vs "copilot") in `SYMLINK_ADAPTERS` or
  `NATIVE_MARKETPLACE_ADAPTERS`?
- `.agents/skills/creating-<agent-id>-plugin/SKILL.md` — does a skill for
  it already exist?

**If either already exists: stop immediately.** Don't touch any file. Just
reply that the agent is already supported, and name the existing
adapter file and/or skill so the user can go look.

Only continue past this point for a genuinely new agent.

## Step 1 — research the agent's plugin/extension system

Read the official docs (WebFetch/WebSearch as needed — prefer the
project's own `developer.*`/`docs.*` domain over third-party blogs) and
answer all of these before writing anything:

1. **Does it have a first-party, non-interactive CLI** that can install a
   plugin/extension from a git repo or a marketplace/catalog entry
   (something scriptable, not just an in-app interactive picker)? This is
   the single fact that decides which of maui's two adapter shapes to
   build — see Step 2.
2. **Folder conventions**: exact directory names for skills, agents/
   subagents, commands, rules — and both **project scope** (relative to a
   repo, e.g. `.foo/skills/`) and **global/user scope** (relative to
   `$HOME`, e.g. `~/.foo/skills/`) paths for each. Note which components
   the agent doesn't support at all — don't invent folders it won't read.
3. **Manifest file**, if any — filename, required/optional fields, and
   whether component paths need explicit declaration or are
   auto-discovered by convention.
4. **Detection**: how would a script tell the agent is actually installed
   — a resolvable CLI binary on `$PATH` (`Bun.which`-style), or only a
   config folder's existence? (A native CLI implies binary-based
   detection; a pure file-convention tool usually only has a config
   folder to check, since many are GUI-first with no guaranteed CLI.)
5. **Marketplace/catalog mechanism**, if any — a `marketplace.json`-style
   repo catalog, a `config.toml` source list, or nothing at all (repo-URL
   installs only).
6. **Hooks/MCP support**, if any, and whether it shares a schema with
   anything already documented in this repo's other `creating-*-plugin`
   skills (worth calling out explicitly if so — see
   [creating-codex-plugin](../skills/creating-codex-plugin/SKILL.md) for
   an example of documenting a schema overlap with another tool).

Where the docs are silent or ambiguous on something you're about to rely
on (exact CLI flags especially), say so plainly rather than presenting a
guess as fact — this repo's existing adapters (see `src/adapters/grok.ts`)
model that honesty explicitly in their doc comments, and the skill you
write in Step 3 should too.

## Step 2 — classify: native-marketplace or symlink adapter

Based on Step 1's answer to "does it have a scriptable install CLI":

- **Yes** → **native-marketplace adapter**. Mirror the shape in
  `src/adapters/grok.ts` (branches on single vs. marketplace source),
  `src/adapters/claude-code.ts` (simplest two-command shape), or
  `src/adapters/gemini.ts` (`installsWholeMarketplace: true`, if this
  agent's CLI installs an entire repo as one unit with no per-plugin
  granularity — check this specifically). Implements
  `NativeMarketplaceAdapter` from `src/types.ts`: `id`, `kind:
  "native-marketplace"`, `detect()` (checks `Bun.which`), `install()`,
  `remove()`, optionally `installsWholeMarketplace`.
- **No** (folders only, no install CLI) → **symlink adapter**. Mirror
  `src/adapters/kiro.ts` (global + project, both real folders),
  `src/adapters/cursor.ts` (project-only, no global folder), or
  `src/adapters/windsurf.ts` (same shape as Cursor). Implements
  `GlobalSymlinkAdapter` from `src/adapters/registry.ts`: `id`,
  `globalRoot?()`, `projectRoot?()`, `detect?()`. Add `linkExtra()` only
  if the agent has a fixed-convention single-file target the way
  OpenCode's `hooks/opencode-hooks.ts` does (see
  `src/adapters/opencode.ts`) — most new agents won't need this.

## Step 3 — write the research skill

Create `.agents/skills/creating-<agent-id>-plugin/SKILL.md`, matching the
structure, tone, and depth of the existing skills in
`.agents/skills/creating-*-plugin/`: YAML frontmatter (`name` matching the
directory, a `description` stating what it's for and when to use it),
directory layout, manifest schema (if any), per-component folder
conventions with a project-scope/global-scope table, install/CLI commands
(if any), and a short publishing checklist. Cross-link it from
`.agents/skills/creating-agents-plugin/SKILL.md`'s per-tool skill list and
its folder-support matrix table.

**This skill file must not mention maui anywhere** — write it as
standalone reference material about the agent itself, exactly like the
existing nine. Cite official doc URLs for anything a future reader might
need to double check or that changes over time (exact CLI flags, version
gates).

## Step 4 — implement the adapter

1. Add `src/adapters/<agent-id>.ts` per the shape chosen in Step 2. Use a
   doc comment citing the sources from Step 1, same style as the existing
   adapters — note explicitly anything not confirmed by official docs.
2. Register it in `src/adapters/registry.ts`: import it, add it to
   `SYMLINK_ADAPTERS` or `NATIVE_MARKETPLACE_ADAPTERS`.
3. Wire a default target into `src/core/scaffold.ts`'s `targets` object in
   **both** `scaffoldStandalonePlugin` and `scaffoldPluginInMarketplace` —
   `{ marketplace: true, repo, ... }` for a native-marketplace agent (see
   the `claude-code`/`codex`/`gemini`/`grok` entries), or a folder-mapping
   object for a symlink agent (see the `cursor`/`windsurf`/`kiro`/
   `opencode` entries — only map folders the agent actually supports per
   Step 1, don't copy the `skills/`+`commands/`+`agents/` set blindly if
   this agent doesn't have all three).
4. Update `SPEC.md`: add the agent to the **Agent Adapter Strategies**
   table, to the matching **Native-marketplace adapters** or **Symlink
   adapters** subsection with the same citation style as the existing
   entries, and to the canonical `maui.json` example if it changes the
   pattern in a way worth illustrating.
5. Update `README.md`: add the agent to the intro's agent list and to its
   adapter table, matching the existing row format.

## Step 5 — tests

Follow this repo's existing conventions (see `CLAUDE.md`'s Testing
Strategy and any `tests/integration/<other-agent>*.test.ts` file as a
template — real temp dirs via `mkdtemp`, an explicit fixture `$HOME`/
`$PATH`, no mocking):

- `tests/integration/<agent-id>.test.ts` — install/remove for this
  adapter.
- For a native-marketplace adapter, also
  `tests/integration/<agent-id>-marketplace.test.ts` — stub the agent's
  CLI as a shell script on a fixture `$PATH` that logs its invocation args
  to a file, and assert on that log (see `codex-marketplace.test.ts` or
  `grok-marketplace.test.ts` for the pattern).
- Add scaffold assertions (in `tests/integration/scaffold.test.ts`) for
  the new default target entry.

## Step 6 — verify

Run `bun run lint` and `bun test`. Fix anything red before considering
this done — don't report success with failing tests or a failing
typecheck.

## Step 7 — summarize

Report: the new adapter file, its classification (native-marketplace vs.
symlink) and why, what got updated in `scaffold.ts`/`SPEC.md`/`README.md`,
the new skill file, and the test results. Flag anything from Step 1 that
was ambiguous or unconfirmed in the agent's own docs, so it's easy to
revisit later.
