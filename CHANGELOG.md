# Changelog

All notable changes to this project are documented here. Format loosely
follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/format/).
maui hasn't cut a tagged release yet — everything below is `0.1.0`
in-progress development, newest first. Once a real release happens, new
entries go under `[Unreleased]` at the top.

## [Unreleased]

## 0.1.0 (in development)

### 2026-07-27

- Standalone plugin and marketplace scaffolds (`maui create-plugin`,
  `maui create-marketplace`) now also generate a root `tsconfig.json` and
  `@types/bun`/`@types/node`/`typescript` devDependencies, so the
  scaffolded repo can run `tsc --noEmit` out of the box. A plugin folder
  added into an existing marketplace still relies on the marketplace
  root's copy instead of duplicating it.

### 2026-07-23

- Added a Kimi Code CLI symlink adapter.
- Consolidated project guidance into `AGENTS.md`, with `CLAUDE.md` reduced
  to a stub that references it; added `AGENTS.md` as a generic mirror for
  non-Claude agents.
- Added per-agent plugin-creation skills and an `add-agent-support`
  command for scaffolding support for a new coding agent.
- Wired `agents/` into the `opencode`/`_default` maui.json targets and
  scaffolded a shared `hooks/hooks.json` by default.

### 2026-07-20

- **Multi-plugin marketplace install & removal**: registry schema for
  shared marketplace cache directories, `detectSourceMode()` to
  distinguish single-plugin vs. marketplace sources, a shared-cache-key
  rewrite of `fetchSource()`, plugin-selection UX for marketplace
  installs, and marketplace-mode install wiring across every native
  adapter (Claude Code, Gemini, Grok, Codex), each with its own
  regression proof, dedup mechanism, or source-mode branching as needed.
  `maui update` now dedupes by shared source repo; fixed a purge
  cache-dir bug and added a sibling-plugin check so removing one plugin
  never tears down a cache directory a sibling still depends on.
- `create-plugin` marketplace mode now generates a per-plugin `maui.json`
  for plugins added to an existing marketplace repo.
- Reworked the OpenCode adapter to be symlink-based, with
  `hooks/opencode-hooks.ts` support.
- Resolved SPEC.md's remaining open questions: confirmed Claude Code's
  self-hosted marketplace pattern, implemented Gemini's `extensions`
  uninstall command, switched the Grok adapter to its documented direct
  git-install path, confirmed GitHub Copilot/Antigravity have real plugin
  CLIs, and confirmed the remaining `contextFile` conventions.
- Branding: added a hook logo/emoji; added MIT license, a contribution
  guide, and general README polish; expanded the README with the "Multi
  Agents Unique Install" name explanation; rewrote `CLAUDE.md` with
  project-specific guidance.

### 2026-07-17

- Split the single `maui create` command into `create` / `create-plugin`
  / `create-marketplace`, each with its own scaffold shape.
- Added `scaffoldMarketplace()` (repo-shell scaffold with an `owner`
  field) and `create-plugin` marketplace-mode detection (append a plugin
  into an existing marketplace's manifests instead of scaffolding a new
  standalone repo).
- Verified a two-plugin marketplace end-to-end; fixed a real readline
  hang found in the process.
- Added a comprehensive README.
- Fixed: `maui install --agent` wasn't actually filtering anything.

### 2026-07-11

- Added `--scope project` support for symlink adapters, and Cursor /
  Windsurf adapters (project scope only).
- Added the `maui create` scaffolding command and `maui update`.
- Upgraded TypeScript to `7.0.2`.
- Corrected SPEC.md: maui is Bun-only, not installable via npm/pnpm/yarn.

### 2026-07-10

- Initial project scaffold: Bun/TypeScript CLI skeleton.
- Core primitives: plugin manifest parsing/validation, registry
  read/write, plugin source fetch (git clone + local path), and a
  per-child symlink linker with conflict backup.
- Walking skeleton: `maui install` via the always-on `.agents` adapter,
  then `maui list`/`status`, `maui remove --purge`, and `maui link`/
  `unlink`.
- Added the Kiro adapter and the shared `marketplace-exec.ts` shell-out
  primitive, followed by native-marketplace adapters for Claude Code,
  Gemini CLI, Codex CLI (with ask-first consent for the third-party
  tool), OpenCode, and Grok CLI — then wired all adapters into the
  `installPlugin`/`removePlugin` orchestration.
- Added per-adapter `contextFile` resolution and postinstall/postremove
  hook execution (`upsertBlock` + consent), wired into the install/remove
  flow.
