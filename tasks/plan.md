# Implementation Plan: maui

## Overview

Build `maui` per `SPEC.md`: a Bun/TypeScript CLI that installs plugins into
whichever AI coding agents are present on a machine, either by shelling out
to an agent's own native marketplace CLI (Claude Code, Codex, Gemini,
OpenCode, Grok) or by symlinking files into an agent's config folder
(Cursor, Windsurf, Kiro), with an always-on `.agents` fallback and optional
postinstall/postremove hooks.

## Architecture Decisions

- **Walking skeleton first**: get `maui install` working end-to-end through
  the simplest possible path (the always-on `.agents` fallback adapter, a
  pure symlink adapter with no native CLI to shell out to) before touching
  any native-marketplace adapter. This proves fetch → manifest → linker →
  registry → CLI wiring with the least moving parts.
- **Adapters are added one at a time**, each its own task, since each one
  carries its own unverified specifics (per SPEC.md's Open Questions) that
  need confirming during implementation, not assumed up front.
- **Native-marketplace execution is a shared primitive** (`marketplace-exec.ts`)
  built once, then reused by every native-marketplace adapter — avoids
  duplicating "shell out, capture stdout/stderr/exit code, wrap errors"
  five times.
- **Postinstall/postremove hooks are their own phase**, built after both
  adapter categories exist, since the hook context (`agent`, `scope`,
  `contextFile`) depends on adapters already being able to report a
  successful install.
- **Project scope (`--scope project`) is threaded through after global scope
  works**, not built in parallel — global is the simpler case (no directory
  resolution relative to a project root) and proves the model first.

## Task List

### Phase 1: Foundation
- [x] Task 1: Project scaffolding (Bun/TS project, CLI entrypoint, git init)

### Phase 2: Core primitives (no adapters yet)
- [x] Task 2: Plugin manifest parsing & validation
- [x] Task 3: Registry read/write
- [x] Task 4: Plugin source fetch (git clone/pull + local path)

### Checkpoint: Phase 1-2
- [ ] `bun test` passes, `bun build` succeeds
- [ ] A manifest can be parsed, validated, and rejected when invalid
- [ ] A local-path plugin source can be "fetched" into `~/.maui/plugins/<name>`

### Phase 3: Walking skeleton (symlink path via the always-on fallback)
- [x] Task 5: Symlink linker (per-child symlink rule + conflict backup)
- [x] Task 6: Generic `.agents` fallback adapter + `maui install` wiring
- [x] Task 7: `maui list` / `maui status`
- [x] Task 8: `maui remove` (symlink path) + `--purge`
- [x] Task 9: `maui link` / `maui unlink`

### Checkpoint: Phase 3
- [x] `maui install <local-plugin>` populates `~/.agents/...` correctly end to end
- [x] `maui remove` cleans up with no orphaned symlinks or backup files
- [x] Two plugins sharing a `skills/` container don't clobber each other

### Phase 4: Remaining symlink adapters
- [x] Task 12: Kiro adapter — both project (`.kiro/steering/`) and global
      (`~/.kiro/steering/`) conventions confirmed as real directories; fits
      the existing model directly.
- [x] Task 10: Cursor adapter — project-scope only (`.cursor/rules/`).
      Cursor's "User Rules" (global scope) are UI/database-managed, not a
      filesystem folder — `globalRoot` is intentionally absent (made
      optional on `GlobalSymlinkAdapter` for this reason); global installs
      of a cursor-targeting plugin are cleanly skipped and reported, with
      the always-on `.agents/rules/` fallback covering the global case.
- [x] Task 11: Windsurf adapter — project-scope only (`.windsurf/rules/`).
      Windsurf's global rules file
      (`~/.codeium/windsurf/memories/global_rules.md`) is a single shared
      file, not a directory — doesn't fit the per-child-symlink model, so
      no `globalRoot` here either; global support would need the
      postinstall/`upsertBlock` mechanism instead, not attempted in v1.

### Phase 5: Native-marketplace adapters
- [x] Task 13: `marketplace-exec.ts` shared shell-out primitive
- [x] Task 14: Claude Code adapter
- [x] Task 15: Gemini CLI adapter
- [x] Task 16: Codex CLI adapter (third-party `codex-marketplace`, ask-first consent)
- [x] Task 17: OpenCode adapter
- [x] Task 18: Grok CLI adapter

### Checkpoint: Phase 4-5
- [x] Every adapter has a passing integration test (fixture `$HOME` for symlink
      adapters, fake CLI on fixture `$PATH` for native-marketplace adapters)
- [x] `maui install` on a machine with multiple agents detected produces the
      right outcome per agent, with undetected agents skipped and reported
      (Task 18b, added mid-build to close this gap — see tasks/todo.md)

### Phase 6: Postinstall / Postremove hooks
- [x] Task 19: Per-adapter `contextFile` resolution
- [x] Task 20: Postinstall/postremove execution + `upsertBlock` + consent prompts
- [x] Task 21: Wire hooks into install/remove flow, registry tracking for auto-cleanup

### Phase 7: Project scope
- [x] Task 22: `--scope project` across install + `<project>/.maui/config.json`
      (symlink adapters only — native-marketplace project scope is a
      documented follow-up, not wired; link/unlink weren't extended either,
      beyond this task's literal acceptance criteria)

### Phase 8: Scaffolding
- [x] Task 23: `maui create <plugin-name>`

### Phase 9: Update
- [x] Task 24: `maui update`

### Checkpoint: v1 Complete
- [x] All SPEC.md Success Criteria pass — mostly, with documented exceptions
      (native-marketplace project scope, a few unconfirmed native-CLI
      commands); see the end-of-build summary
- [x] `bun test` and `bun build` clean (104 tests passing)
- [x] Ready for human review

### Phase 10: Multi-plugin marketplace scaffolding

Added after v1: splits `maui create` into three commands so adding a second
plugin to an existing repo doesn't require manual JSON editing. Grounded in
the real structure of [wshobson/agents](https://github.com/wshobson/agents)
rather than an invented layout — see SPEC.md's rewritten **Plugin
Scaffolding** section for the full design, confirmed findings (Gemini has
no per-plugin marketplace concept; `.agents/plugins/marketplace.json` is a
second real-world manifest shape), and the two decisions already made with
the user (Gemini manifest at marketplace root; include the `.agents`
manifest).

- [x] Task 25: `scaffoldMarketplace()` — repo-shell scaffold
- [x] Task 26: `create-plugin` marketplace-mode detection + append-to-existing-manifests
- [x] Task 27: CLI wiring — `create-plugin`, `create-marketplace` subcommands, `create` becomes a dispatcher
- [x] Task 28: End-to-end verification against SPEC.md's two-plugin success criterion
      — found and fixed a real `node:readline/promises` bug along the way
      (see tasks/todo.md's Task 28 entry); the scaffolding logic itself was
      correct on the first try

### Checkpoint: Phase 10
- [x] A fresh `create-marketplace` repo's `.claude-plugin/marketplace.json`
      has an empty `plugins` array and an `owner` field
- [x] Running `create-plugin` twice from inside that repo produces two
      entries in both `.claude-plugin/marketplace.json` and
      `.agents/plugins/marketplace.json`, with zero manual edits
- [x] Running `create-plugin` in an empty directory (no marketplace present)
      still produces the original, unchanged single-plugin scaffold
- [x] `bun test` and `bun build` clean (117 tests passing)

### Phase 11: Resolve SPEC.md's Open Questions

SPEC.md's "Open Questions" section accumulated several items flagged during
earlier phases as "confirm during Plan/Implement phase" but never actually
closed out, even though the adapters they concern are already shipped and
in use. Some are pure research gaps (exact CLI argument shapes, uninstall
syntax, contextFile paths); a few are product decisions deliberately
deferred and never revisited (registry/index, version pinning, `bun build
--compile`); one (#7, CLI arg-parsing library) is stale — already resolved
implicitly by the existing hand-rolled `Bun.argv` parser. Goal: close every
open question with either a confirmed-by-docs implementation change or an
explicit, documented decision — never leave a bare unresolved question.
Same discipline as Tasks 13–18: research the tool's real docs first, then
implement; if a fact can't be confirmed, say so explicitly and pick the
safe default rather than guess.

- [x] Task 29: Confirm Claude Code's self-hosted single-plugin marketplace
      pattern (Open Question #3) — done first since `scaffold.ts`'s
      already-shipped output depends on it. Confirmed by Claude Code's own
      docs: `source: "."` is correct as-is, no code change needed.
- [x] Task 30: Confirm Gemini's uninstall syntax + project-scope contextFile
      path (Open Question #2, part of #8). Uninstall confirmed and
      implemented; project-scope contextFile path stayed genuinely
      unconfirmed and rolled into Task 33.
- [x] Task 31: Confirm Grok CLI argument shapes (Open Question #2c) — the
      primary reference page never confirmed or denied the old by-analogy
      shape; adopted a more specific, session-surfaced direct-git-install
      path instead, flagged as not fully docs.x.ai-confirmed
- [x] Task 32: Decide GitHub Copilot / Antigravity adapter scope (remainder
      of Open Question #1) — research finding overturned the plan's
      assumed default: both tools have real, scriptable plugin CLIs.
      Per this task's own guardrail, no adapter was built here; flagged as
      candidate work for a future phase (see below) instead.
- [x] Task 33: Fill in remaining contextFile conventions for Codex, Grok,
      Cursor, Windsurf, Kiro (remainder of Open Question #8). Confirmed
      Codex, Cursor, Windsurf, Kiro, and Gemini's project-scope path; Grok
      stays genuinely unconfirmed — the one open item left in the phase.
- [x] Task 34: Resolve the remaining decision-only Open Questions (#4
      registry/index, #5 versioning/pinning, #6 `bun build --compile`, #7
      CLI arg-parsing library — mark resolved, not deferred). Done out of
      order, ahead of Tasks 30–33, due to a WebFetch/WebSearch outage —
      this task needed no external research.

- [x] Task 35: Corroborate Grok's install/uninstall shape (Open Question
      #2c) with a second, independent CLI reference that surfaced after
      Task 31 — wording-only update, no behavior change since the shipped
      implementation already matched.

### Checkpoint: Phase 11
- [x] Every numbered Open Question (1–8, including sub-items 2a/2c) in
      SPEC.md reads as resolved or explicitly deferred with a stated reason
      — none left as a bare question. One item — Grok's `.agents/skills/`
      reach and its `contextFile` convention — stays honestly unconfirmed,
      which the checkpoint treats as acceptable per its own "resolved OR
      explicitly deferred with a stated reason" bar.
- [x] `bun test`, `bun run build`, `bun run lint` all clean — 137 tests
- [x] `grep -n "unconfirmed\|not found\|TBD" SPEC.md` returns nothing tied
      to Open Questions #1–#8 beyond the two intentional Grok mentions

### Future Phase Candidates (surfaced by Task 32, not scoped yet)

- **GitHub Copilot adapter**: confirmed via GitHub's own official docs to
  have a Claude-Code-shaped marketplace CLI
  (`copilot plugin marketplace add`, `copilot plugin install
  <name>@<marketplace>`, `copilot plugin uninstall <name>`) — likely a
  fast, low-risk addition, same shape as Tasks 13–18.
- **Antigravity adapter**: `agy plugin install|uninstall|list` subcommands
  confirmed to exist, but exact argument syntax (git URL support,
  marketplace concept) needs one more research pass before implementation
  — Google's own docs page is JS-rendered and wasn't fetchable as static
  content during Task 32's research.

Neither is part of Phase 11's scope — see SPEC.md's Open Question #1 for
the full finding.

### Phase 12: Multi-Plugin Marketplace Install & Removal

`maui install <source>` has assumed exactly one plugin per source since v1
— cache keyed by `manifest.name`, one registry entry, one adapter call.
SPEC.md's "Multi-Plugin Marketplace Install & Removal" section (added this
session) extends that to "multi-plugin marketplace" sources (root
`.claude-plugin/marketplace.json` cataloging `./plugins/<name>/` subfolders,
each with its own `maui.json`): detect the shape, ask which plugin(s) to
install, and route each through the adapter appropriate for it — Grok
switches from its direct-git path to its marketplace path in this mode;
Gemini (and possibly Codex, pending research) install the whole repo once
regardless of selection, since neither has real per-plugin granularity.

Research this session (three Explore passes + one Plan pass, cross-checked
directly against source) surfaced two real correctness gaps this phase must
close, not just extend around:
1. `src/cli/remove.ts`'s `--purge` keys the cache-dir path by the plugin's
   own registry name — correct today only because cache dirs happen to be
   named after the plugin. Once marketplace-mode plugins share one cache
   dir named after the *marketplace* instead, this silently rm's a
   nonexistent path (swallowed by `force: true`) and leaks the real clone.
2. `runUpdate`'s bare `maui update` loops every registry key and refetches
   unconditionally, once per key — once N plugins share one clone, this
   re-clones the same repo N times.

**Architecture decisions:**
- `installPlugin(source, options)` keeps its exact current signature and
  single-plugin `InstallResult` shape — zero change for existing callers.
  Its per-target dispatch loop is extracted into a shared internal
  `installOnePlugin(...)`, called once by `installPlugin` (unchanged) and
  once per selection by a new `installMarketplace(...)`; a new
  `installFromSource(source, options)` dispatches between them based on
  `detectSourceMode`.
- **Walking skeleton proves the mechanism through the symlink/`_default`
  path**, not a native adapter — the new risk (mode detection, shared-cache
  fetch, plugin selection, N registry entries into one clone) is entirely
  adapter-agnostic. Native adapters are proven against the now-generic loop
  afterward, one adapter's specifics per task, same discipline as Tasks
  13–18/Phase 11.
- `installsWholeMarketplace?: boolean` on `NativeMarketplaceAdapter` drives
  one shared dedup mechanism used on *both* install (skip repeat native
  calls, still record every plugin's registry entry) and remove (skip the
  native uninstall unless this is the last sibling referencing that
  `sourceRepo` + agent id).
- Registry gains `sourceRepo`/`pluginPath` on `RegistryPluginEntry`
  (`sourceRepo` populated on every entry going forward, single-plugin
  included, with a fallback for pre-migration entries missing it).
- Grok's mode branch needs a real type addition: `sourceMode?: "single" |
  "marketplace"` on `NativeAdapterRuntimeOptions`, threaded from the
  orchestrator into every adapter call even though only Grok branches on it.
- SPEC.md's "Detecting single-plugin vs. marketplace mode" prose reads as
  if `marketplace.json`'s shape is checked first even with no `maui.json`
  present at all — would break every existing single-`maui.json` fixture.
  The actual, backward-compatible algorithm is root `maui.json` present →
  single-plugin, full stop; only consult `marketplace.json` when it's
  absent. Task 37 implements this and fixes SPEC.md's wording to match.
- `create-plugin`'s per-plugin `maui.json` scaffold fix (Task 49) has no
  code dependency on anything else in this phase — sequenced last for the
  end-to-end "scaffold a marketplace, then install it" proof, but ships
  independently at any point.

- [x] Task 36: Registry schema — `sourceRepo` + `pluginPath`, backward-compat fallback
- [ ] Task 37: `detectSourceMode()` — single-plugin vs. marketplace detection (+ SPEC.md wording fix)
- [ ] Task 38: `fetchSource()` — shared-cache-key rewrite of `fetchPlugin`, consuming Task 37

### Checkpoint: Phase 12 (core primitives)
- [ ] `bun test` passes with zero changes to any existing adapter/install/update/remove test
- [ ] `detectSourceMode` correctly classifies: maui.json-only; maui.json+marketplace.json (self-hosted); marketplace.json-only with `./plugins/<name>` entries; neither
- [ ] `fetchSource` on a single-plugin fixture produces a byte-identical cache dir to today's `fetchPlugin`

- [ ] Task 39: Plugin selection — interactive prompt + `--plugin`/`--all-plugins` + hard error on no-TTY-no-flags
- [ ] Task 40: `installOnePlugin` extraction + `installMarketplace`/`installFromSource` + CLI wiring, proven against symlink targets only (`_default` + one real symlink adapter)

### Checkpoint: Phase 13 (walking skeleton)
- [ ] `maui install <marketplace-fixture> --all-plugins` produces N independent registry entries sharing one `sourceRepo`, correct per-plugin `pluginPath`
- [ ] `maui install <marketplace-fixture> --plugin a` (non-interactive) installs only `a`; no flags + no TTY hard-errors listing catalog names
- [ ] `maui list` shows each selected plugin as its own entry
- [ ] `installPlugin(source, options)` unchanged for every existing caller — full existing suite green

- [ ] Task 41: Claude Code marketplace-mode — regression/proof only, no adapter code change expected
- [ ] Task 42: `installsWholeMarketplace` dedup mechanism (install + remove), built against a fake test-double adapter
- [ ] Task 43: Gemini marketplace-mode (`installsWholeMarketplace: true`)
- [ ] Task 44: Grok marketplace-mode branching (`sourceMode` plumbing + direct-git vs. marketplace-add)
- [ ] Task 45: Codex research — confirm or deny a per-plugin selection flag (Open Question #9), update SPEC.md either way
- [ ] Task 46: Codex marketplace-mode wiring per Task 45's finding

### Checkpoint: Phase 14 (native-marketplace adapters)
- [ ] Every native adapter has a passing marketplace-mode integration test (fake CLI on fixture `$PATH`)
- [ ] Removing one of two Gemini-shared plugins does not call `gemini extensions uninstall`; removing the last one does
- [ ] A single-plugin Grok source still uses the unchanged direct-git path (regression)

- [ ] Task 47: `maui update` — dedupe by `sourceRepo` for both `update <name>` and bare `update`
- [ ] Task 48: `maui remove --purge` — fix the cache-dir-key bug + sibling-check before deleting a shared clone
- [ ] Task 49: `create-plugin` marketplace mode generates a per-plugin `maui.json`

### Checkpoint: Phase 12 (final)
- [ ] `create-marketplace` + `create-plugin` twice (Task 49) produces a real two-plugin repo installable end to end via `maui install <repo> --all-plugins`
- [ ] Removing one plugin leaves the shared clone and sibling's symlinks/native install intact; removing the last one purges the clone
- [ ] `bun test`, `bun run build`, `bun run lint` all clean

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Several native-CLI command shapes are unconfirmed (Gemini `uninstall`, OpenCode `uninstall`, Grok exact arg format, Claude's self-hosted marketplace pattern) | Medium — adapter tasks may need rework once verified against real CLIs | Each adapter task's acceptance criteria includes verifying against real `--help` output or docs before finalizing; integration tests use fakes so they don't block on live verification |
| Postinstall hooks execute arbitrary code | High if consent flow is skipped | Task 20 explicitly implements the ask-first/re-confirm-on-change flow as a hard acceptance criterion, not an afterthought |
| Symlink-container conflicts across plugins | Medium — silent data loss if per-child rule has a bug | Task 5's test suite explicitly covers the multi-plugin-sharing-one-container case before any adapter is built on top of it |
| Appending to an existing `marketplace.json` corrupts it or clobbers another plugin's entry | Medium — this is a mutation of an existing file, not just new-file creation, the first time this project does that in `create-plugin` | Task 26 matches/replaces entries by `name` (not by array index or wholesale overwrite) and has explicit test coverage for "second plugin doesn't disturb the first's entry" |
| `--purge`'s cache-dir path is keyed by the plugin's own registry name, which stops being correct once marketplace-mode plugins share one clone named after the marketplace instead | High — a silent `rm` on a nonexistent path (swallowed by `force: true`) leaks the real shared clone forever, with no error surfaced | Task 48 fixes the lookup to use `resolvePluginCacheDir`/`sourceRepo` instead of `join(pluginsRoot, name)`, with an explicit test asserting the shared clone is actually deleted (not just that `rm` didn't throw) |
| Bare `maui update` re-fetches once per registry key with no dedup — becomes a real, not just theoretical, inefficiency once N plugins share one clone | Medium — wasted network/disk I/O scaling with marketplace size, not a correctness bug on its own | Task 47 groups registry entries by `sourceRepo` before refreshing, one fetch per distinct shared clone |

## Open Questions

Tracked and being actively closed out in **Phase 11** above (Tasks 29–34),
one task per open question or cluster of related questions — see
`tasks/todo.md` for the full acceptance criteria of each.
