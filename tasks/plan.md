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
- [ ] Task 10: Cursor adapter — **DEFERRED to after Task 22.** Cursor's
      "User Rules" (global scope) are UI/database-managed, not a filesystem
      folder — no global-scope adapter to build. Only its project-scope
      target (`.cursor/rules/`) is real, so this is picked up once
      project-scope resolution exists. The always-on `.agents/rules/`
      fallback already covers the global case in the meantime.
- [ ] Task 11: Windsurf adapter — **DEFERRED to after Task 22.** Windsurf's
      global rules file (`~/.codeium/windsurf/memories/global_rules.md`) is
      a single shared file, not a directory — doesn't fit the
      per-child-symlink model. Only its project-scope target
      (`.windsurf/rules/`) fits now; global support belongs with the
      postinstall/`upsertBlock` mechanism (Phase 6) instead, revisited later.

### Phase 5: Native-marketplace adapters
- [x] Task 13: `marketplace-exec.ts` shared shell-out primitive
- [x] Task 14: Claude Code adapter
- [x] Task 15: Gemini CLI adapter
- [ ] Task 16: Codex CLI adapter (third-party `codex-marketplace`, ask-first consent)
- [ ] Task 17: OpenCode adapter
- [ ] Task 18: Grok CLI adapter

### Checkpoint: Phase 4-5
- [ ] Every adapter has a passing integration test (fixture `$HOME` for symlink
      adapters, fake CLI on fixture `$PATH` for native-marketplace adapters)
- [ ] `maui install` on a machine with multiple agents detected produces the
      right outcome per agent, with undetected agents skipped and reported

### Phase 6: Postinstall / Postremove hooks
- [ ] Task 19: Per-adapter `contextFile` resolution
- [ ] Task 20: Postinstall/postremove execution + `upsertBlock` + consent prompts
- [ ] Task 21: Wire hooks into install/remove flow, registry tracking for auto-cleanup

### Phase 7: Project scope
- [ ] Task 22: `--scope project` across install/link/unlink + `<project>/.maui/config.json`

### Phase 8: Scaffolding
- [ ] Task 23: `maui create <plugin-name>`

### Phase 9: Update
- [ ] Task 24: `maui update`

### Checkpoint: Complete
- [ ] All SPEC.md Success Criteria pass manually against a fixture machine
- [ ] `bun test` and `bun build` clean
- [ ] Ready for human review

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Several native-CLI command shapes are unconfirmed (Gemini `uninstall`, OpenCode `uninstall`, Grok exact arg format, Claude's self-hosted marketplace pattern) | Medium — adapter tasks may need rework once verified against real CLIs | Each adapter task's acceptance criteria includes verifying against real `--help` output or docs before finalizing; integration tests use fakes so they don't block on live verification |
| Postinstall hooks execute arbitrary code | High if consent flow is skipped | Task 20 explicitly implements the ask-first/re-confirm-on-change flow as a hard acceptance criterion, not an afterthought |
| Symlink-container conflicts across plugins | Medium — silent data loss if per-child rule has a bug | Task 5's test suite explicitly covers the multi-plugin-sharing-one-container case before any adapter is built on top of it |

## Open Questions

Carried over from SPEC.md's own Open Questions list (folder conventions for
Cursor/Windsurf/Kiro, exact native-CLI argument shapes, contextFile
conventions for unconfirmed adapters, etc.) — each surfaces again as a task-
level acceptance criterion in `tasks/todo.md` rather than being repeated here.
