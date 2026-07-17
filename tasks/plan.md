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

- [ ] Task 25: `scaffoldMarketplace()` — repo-shell scaffold
- [ ] Task 26: `create-plugin` marketplace-mode detection + append-to-existing-manifests
- [ ] Task 27: CLI wiring — `create-plugin`, `create-marketplace` subcommands, `create` becomes a dispatcher
- [ ] Task 28: End-to-end verification against SPEC.md's two-plugin success criterion

### Checkpoint: Phase 10
- [ ] A fresh `create-marketplace` repo's `.claude-plugin/marketplace.json`
      has an empty `plugins` array and an `owner` field
- [ ] Running `create-plugin` twice from inside that repo produces two
      entries in both `.claude-plugin/marketplace.json` and
      `.agents/plugins/marketplace.json`, with zero manual edits
- [ ] Running `create-plugin` in an empty directory (no marketplace present)
      still produces the original, unchanged single-plugin scaffold
- [ ] `bun test` and `bun build` clean

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Several native-CLI command shapes are unconfirmed (Gemini `uninstall`, OpenCode `uninstall`, Grok exact arg format, Claude's self-hosted marketplace pattern) | Medium — adapter tasks may need rework once verified against real CLIs | Each adapter task's acceptance criteria includes verifying against real `--help` output or docs before finalizing; integration tests use fakes so they don't block on live verification |
| Postinstall hooks execute arbitrary code | High if consent flow is skipped | Task 20 explicitly implements the ask-first/re-confirm-on-change flow as a hard acceptance criterion, not an afterthought |
| Symlink-container conflicts across plugins | Medium — silent data loss if per-child rule has a bug | Task 5's test suite explicitly covers the multi-plugin-sharing-one-container case before any adapter is built on top of it |
| Appending to an existing `marketplace.json` corrupts it or clobbers another plugin's entry | Medium — this is a mutation of an existing file, not just new-file creation, the first time this project does that in `create-plugin` | Task 26 matches/replaces entries by `name` (not by array index or wholesale overwrite) and has explicit test coverage for "second plugin doesn't disturb the first's entry" |

## Open Questions

Carried over from SPEC.md's own Open Questions list (folder conventions for
Cursor/Windsurf/Kiro, exact native-CLI argument shapes, contextFile
conventions for unconfirmed adapters, etc.) — each surfaces again as a task-
level acceptance criterion in `tasks/todo.md` rather than being repeated here.
