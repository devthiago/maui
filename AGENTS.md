# AGENTS.md

This file provides guidance to AI agents when working with code in this repository.

## What this is

`maui` is a Bun-only CLI that installs plugins (skills, agents, commands,
rules, hooks) into whichever AI coding agents are present on a machine —
Claude Code, Codex CLI, Gemini CLI, Grok CLI, Cursor, Windsurf, Kiro,
OpenCode — using each agent's own native install mechanism where one
exists, and symlinking otherwise. `SPEC.md` is the authoritative
behavioral spec; consult it (not just the code) before changing intended
behavior, and update it alongside any behavior change. `tasks/plan.md` /
`tasks/todo.md` track phase-by-phase implementation history and any
still-open work — check them before assuming something described in
`SPEC.md` isn't built yet.

## Commands

```
bun install                              # install deps
bun run build                            # bun build ./src/cli/index.ts --outdir dist --target bun
bun test                                 # run the full suite
bun test tests/integration/install.test.ts   # run one file
bun test -t "some test name"             # filter by test name
bun test:watch                           # bun test --watch
bun run lint                             # tsc --noEmit — the only "linter"; no eslint
bun run src/cli/index.ts -- <subcommand> # run the CLI from source, e.g. `-- install ./my-plugin`
```

## Bun-only, deliberately

No Node.js runtime support — `package.json` has no `node_modules`-requiring
build step, and `bin.maui` points straight at `src/cli/index.ts` (shebang
`#!/usr/bin/env bun`). Prefer `Bun.file`/`Bun.write` over `node:fs`
read/write, `Bun.which` for binary resolution on `$PATH`, `Bun.$` for
shelling out, and `bun:test` (not jest/vitest). maui is never published to
npm — it's distributed via Bun's `github:` dependency specifier
(`bunx github:<owner>/maui`, `bun add -g github:<owner>/maui`); keep this
in mind before adding anything that assumes a registry publish step.

## Architecture

Three layers:

- **`src/cli/`** — command orchestration only. `index.ts` parses argv and
  dispatches; each subcommand's real logic (install/remove/update/link/
  unlink/create) lives in its own file here. Command handlers stay thin and
  delegate to `core/`.
- **`src/core/`** — CLI-agnostic primitives: manifest parsing/validation
  (`manifest.ts`), registry read/write (`registry.ts`), plugin source
  fetch/caching (`fetch.ts`), per-child symlinking (`linker.ts`), the
  native-CLI shell-out primitive (`marketplace-exec.ts`), single-vs-
  marketplace source detection (`source-mode.ts`), plugin-selection UX
  (`plugin-selection.ts`), whole-marketplace install/remove dedup
  (`native-dedup.ts`), postinstall/postremove hooks (`postinstall.ts`),
  per-adapter context-file resolution (`context-file.ts`), project-scope
  config (`project-config.ts`), and scaffolding (`scaffold.ts`).
- **`src/adapters/`** — one file per supported agent, each implementing
  either `NativeMarketplaceAdapter` (shells out to that agent's own plugin
  CLI: Claude Code, Codex, Gemini, Grok) or `GlobalSymlinkAdapter`
  (symlinks into that agent's config folder: Cursor, Windsurf, Kiro,
  OpenCode, plus the always-on `.agents/` fallback). `adapters/registry.ts`
  is the only place that looks an adapter up by agent ID — no adapter
  reaches into another adapter's paths or shells out on its behalf; use
  explicit error types (`ManifestValidationError`, `NativeInstallError`,
  etc.) rather than generic `Error` so CLI output can say exactly what went
  wrong.

### The two install paths

Every agent target in a plugin's `maui.json` is either:
- **native-marketplace** — maui never places files itself; it shells out to
  the agent's own install/uninstall CLI.
- **symlink** — maui fetches the plugin source once into
  `~/.maui/plugins/<cache-key>/` and symlinks each *immediate child* of a
  source folder into the agent's config folder — never the container
  folder itself, so multiple plugins can share one `skills/`/`commands/`
  directory without clobbering each other. OpenCode is a symlink adapter
  but is still detected via `$PATH` (like native-marketplace agents) rather
  than by config-folder existence, since it's CLI-first.

`installOnePlugin` (`src/cli/install.ts`) is the single place that runs
this per-target dispatch loop and writes a plugin's registry entry — both
`installPlugin` (single-plugin sources) and `installMarketplace`
(multi-plugin sources, below) funnel through it.

### Single-plugin vs. multi-plugin marketplace sources

A source passed to `maui install` is either:
- **single-plugin**: a `maui.json` at the source root — one plugin per
  source, cached at `~/.maui/plugins/<manifest.name>/`.
- **multi-plugin marketplace**: a root `.claude-plugin/marketplace.json`
  cataloging `./plugins/<name>/` subfolders, each with its own
  `maui.json`. The whole repo is cloned once into
  `~/.maui/plugins/<marketplace-name>/`, and the user selects which
  catalogued plugin(s) to install (interactive prompt, or
  `--plugin`/`--all-plugins`; a hard error if neither TTY nor flags are
  available — maui never silently installs every plugin in a catalog).

`detectSourceMode()` (`core/source-mode.ts`) distinguishes these — a root
`maui.json` always wins, checked first, regardless of whether a
`marketplace.json` also exists. `fetchSource()` (`core/fetch.ts`) does the
actual clone/copy, keyed by whichever name `detectSourceMode` resolved.
Registry entries for marketplace-sourced plugins carry `sourceRepo` (the
shared cache dir) and `pluginPath` (this plugin's subfolder within it);
always resolve a plugin's cache dir via `resolvePluginCacheDir()`
(`core/registry.ts`) rather than re-deriving the path inline, since
pre-migration entries may not have `sourceRepo` set.

Two native adapters branch on marketplace mode in adapter-specific ways:
- **Gemini** (`installsWholeMarketplace: true`) installs the entire
  marketplace repo as one extension regardless of how many plugins are
  selected — `core/native-dedup.ts`'s `shouldSkipNativeInstall`/
  `shouldSkipNativeRemove` ensure the native call fires once per
  marketplace (not once per selected plugin), and that removing one plugin
  never tears down the shared install while a sibling still depends on it.
- **Grok** branches its entire install *strategy* on
  `NativeAdapterRuntimeOptions.sourceMode`: single-plugin sources use its
  direct git-install path (`grok plugin install git+<url> --trust`);
  marketplace sources switch to `grok plugin marketplace add` + per-plugin
  install, matching Claude Code's shape.
- **Codex** selects one plugin from a marketplace by direct repository
  path (`<repo>/<pluginPath> --plugin`, via `NativeMarketplaceIdentity.pluginPath`),
  not by a name qualifier like Claude/Grok.

## Testing conventions

- All tests use `bun:test` with real temp directories (`mkdtemp` under
  `os.tmpdir()`) and an explicit fixture `$HOME`/`$PATH` — never mock the
  filesystem or the adapter registry.
- Native-marketplace adapter tests stub the agent's CLI as an executable
  shell script on a fixture `$PATH` that logs its invocation args to a
  file, then assert on that log (see any `tests/integration/*-marketplace.test.ts`).
- No mocking library or `mock.module` is used anywhere — when a test needs
  to observe or control a side effect, prefer a real fixture or an explicit
  injectable callback already on the relevant options type (e.g.
  `InstallOptions.confirm`, `UpdateOptions.fetchImpl`).
