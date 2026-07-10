# Task List: maui

## Task 1: Project scaffolding ✅ done

**Description:** Set up the Bun/TypeScript project skeleton: `package.json`,
`tsconfig.json`, a `src/cli/index.ts` entrypoint that parses argv and
supports `maui help` (and errors clearly on unknown subcommands), plus a
git repository so subsequent tasks can commit.

**Acceptance criteria:**
- [ ] `bun install` succeeds with no dependencies beyond what's needed for a bare CLI
- [ ] `bun run src/cli/index.ts -- help` prints the command list from SPEC.md's Commands section
- [ ] `git init` has been run and this task's files are the first commit

**Verification:**
- [ ] `bun test` runs (even with zero tests, exits clean)
- [ ] `bun build ./src/cli/index.ts --outdir dist --target node` succeeds

**Dependencies:** None

**Files likely touched:**
- `package.json`, `tsconfig.json`, `.gitignore`
- `src/cli/index.ts`
- `src/types.ts`

**Estimated scope:** Small

---

## Task 2: Plugin manifest parsing & validation ✅ done

**Description:** Implement `core/manifest.ts`: parse a `maui.json` file into
a typed structure and validate it (required `name`/`version`, `targets` is
an object, each native-marketplace target is either `{ marketplace: true }`
or has adapter-specific identity fields, each symlink target is a
string-to-string map, `postinstall`/`postremove` are optional string paths).
Invalid manifests raise a `ManifestValidationError` with a message specific
enough to act on.

**Acceptance criteria:**
- [ ] A valid manifest (matching SPEC.md's example) parses into the typed shape
- [ ] Missing `name`, missing `version`, and a malformed `targets` entry each
      raise `ManifestValidationError` with a distinct, specific message
- [ ] `postinstall`/`postremove` are optional — a manifest omitting both parses fine

**Verification:**
- [ ] `bun test tests/unit/manifest.test.ts` passes

**Dependencies:** Task 1

**Files likely touched:**
- `src/core/manifest.ts`, `src/types.ts`
- `tests/unit/manifest.test.ts`

**Estimated scope:** Small

---

## Task 3: Registry read/write ✅ done

**Description:** Implement `core/registry.ts`: read/write
`~/.maui/registry.json`, tracking installed plugins, their source, the
agents/scopes they're active on (native-installed vs. symlinked), and
(later) which `contextFile`s got a postinstall block written. Missing file
= empty registry, not an error.

**Acceptance criteria:**
- [ ] Writing then reading the registry round-trips exactly
- [ ] Reading a registry that doesn't exist yet returns an empty registry, no throw
- [ ] Concurrent-write safety isn't required for v1 (single-process CLI) — note this, don't build for it

**Verification:**
- [ ] `bun test tests/unit/registry.test.ts` passes, using a fixture tmp dir as `$HOME`

**Dependencies:** Task 1

**Files likely touched:**
- `src/core/registry.ts`
- `tests/unit/registry.test.ts`

**Estimated scope:** Small

---

## Task 4: Plugin source fetch ✅ done

**Description:** Implement `core/fetch.ts`: given a source (git URL or local
path), populate `~/.maui/plugins/<name>` with the plugin's files. For a git
source, clone (or pull if already cached). For a local path (dev/testing),
copy or symlink the whole tree into the cache — decide which during
implementation and note the choice, since it affects how `update` behaves
for local sources.

**Acceptance criteria:**
- [ ] A local-path source ends up readable at `~/.maui/plugins/<name>` with `maui.json` present
- [ ] A second fetch of the same plugin is idempotent (no duplicate clone, updates in place)

**Verification:**
- [ ] `bun test tests/integration/fetch.test.ts` passes against a fixture git repo and a fixture local dir

**Dependencies:** Task 1, Task 2 (needs a valid `maui.json` fixture to fetch)

**Files likely touched:**
- `src/core/fetch.ts`
- `tests/integration/fetch.test.ts`

**Estimated scope:** Small

---

## Task 5: Symlink linker (per-child rule + conflict backup) ✅ done

**Description:** Implement `core/linker.ts` per SPEC.md's "Symlinking rule:
only final files/folders, never the parent": given a source folder and a
destination container path, create the container as a real directory
(`mkdir -p`) if missing, then symlink each immediate child individually.
Any pre-existing non-maui-owned item at a child's target path gets renamed
to `<name>.maui-backup-<timestamp>` before the symlink is placed. Removal
walks the same list and removes only the symlinks maui created (tracked via
registry, not by re-deriving from the plugin source, since the source may
have since changed).

**Acceptance criteria:**
- [ ] Linking a plugin's `skills/` folder into an agent's `skills/` container
      creates the container as a real dir and each skill subfolder as its own symlink
- [ ] A second plugin linking into the same container doesn't disturb the first plugin's symlinks
- [ ] A pre-existing non-symlink file at a target child path is backed up, not overwritten in place
- [ ] `unlink`/`remove` removes exactly the symlinks this plugin created, nothing else in the shared container

**Verification:**
- [ ] `bun test tests/integration/linker.test.ts` passes, including the
      multi-plugin-sharing-one-container case and the conflict-backup case

**Dependencies:** Task 1, Task 3 (needs registry to track which symlinks belong to which plugin)

**Files likely touched:**
- `src/core/linker.ts`
- `tests/integration/linker.test.ts`

**Estimated scope:** Medium

---

## Task 6: Generic `.agents` fallback adapter + `maui install` wiring ✅ done

**Description:** Implement `adapters/generic-agents.ts` (the always-on
fallback) and wire together fetch → manifest → linker → registry behind
`maui install <source>`. This is the walking skeleton: no native CLI
shelling, no agent detection branching yet — just prove the full pipeline
end to end using the one adapter that's unconditional.

**Acceptance criteria:**
- [ ] `maui install <local-plugin-path>` populates `~/.agents/<subfolder>/...`
      per the plugin's `_default` mapping, per-child-symlinked, unconditionally
- [ ] Running `maui install` twice for the same plugin is idempotent

**Verification:**
- [ ] `bun test tests/integration/install.test.ts` passes against a fixture `$HOME`
- [ ] Manual check: `bun run src/cli/index.ts -- install ./fixtures/example-plugin` against a real tmp `$HOME` produces the expected symlinks

**Dependencies:** Task 4, Task 5

**Files likely touched:**
- `src/adapters/generic-agents.ts`
- `src/cli/install.ts`
- `tests/integration/install.test.ts`

**Estimated scope:** Medium

---

## Task 7: `maui list` / `maui status` ✅ done

**Description:** Read the registry and print installed plugins, their
source, version, and which agents/scopes each is active on.

**Acceptance criteria:**
- [ ] `maui list` after an install shows the plugin with correct metadata
- [ ] `maui list` with nothing installed prints a clear "no plugins installed" message, not an error

**Verification:**
- [ ] `bun test tests/unit/cli-list.test.ts` passes

**Dependencies:** Task 3, Task 6

**Files likely touched:**
- `src/cli/list.ts`
- `tests/unit/cli-list.test.ts`

**Estimated scope:** Small

---

## Task 8: `maui remove` (symlink path) + `--purge`

**Description:** Remove a plugin's symlinks (via the linker's removal path)
across every agent/scope it's registered against, update the registry, and
optionally delete the cached source with `--purge`.

**Acceptance criteria:**
- [ ] `maui remove <name>` removes all of that plugin's symlinks and its registry entry
- [ ] Without `--purge`, `~/.maui/plugins/<name>` still exists after remove
- [ ] With `--purge`, it's deleted — but only after asking first if still linked elsewhere (per SPEC.md Boundaries)

**Verification:**
- [ ] `bun test tests/integration/remove.test.ts` passes, including the `--purge`-while-linked confirmation path

**Dependencies:** Task 5, Task 6, Task 7

**Files likely touched:**
- `src/cli/remove.ts`
- `tests/integration/remove.test.ts`

**Estimated scope:** Small

---

## Task 9: `maui link` / `maui unlink`

**Description:** Attach or detach an already-cached plugin to/from a
specific agent without re-fetching — the same linker primitive as
`install`/`remove`, just addressable per agent without touching the others.

**Acceptance criteria:**
- [ ] `maui link <name> --agent <agent>` links a cached-but-not-yet-linked-to-that-agent plugin
- [ ] `maui unlink <name> --agent <agent>` removes only that agent's symlinks, leaving others intact

**Verification:**
- [ ] `bun test tests/integration/link-unlink.test.ts` passes

**Dependencies:** Task 5, Task 6

**Files likely touched:**
- `src/cli/link.ts`, `src/cli/unlink.ts`
- `tests/integration/link-unlink.test.ts`

**Estimated scope:** Small

---

## Task 10: Cursor adapter

**Description:** Research Cursor's actual global/project rules-folder
convention (SPEC.md Open Question #1 — not yet verified) and implement
`adapters/cursor.ts` accordingly: detection (folder and/or CLI) and target
path mapping.

**Acceptance criteria:**
- [ ] Convention confirmed against Cursor's own docs before coding (cite the source)
- [ ] Detection correctly identifies a fixture "Cursor installed" vs. "not installed" `$HOME`
- [ ] A plugin's mapped folder links into the confirmed target path

**Verification:**
- [ ] `bun test tests/integration/cursor.test.ts` passes against a fixture `$HOME`

**Dependencies:** Task 5, Task 6

**Files likely touched:**
- `src/adapters/cursor.ts`
- `tests/integration/cursor.test.ts`

**Estimated scope:** Small

---

## Task 11: Windsurf adapter

**Description:** Same shape as Task 10, for Windsurf — research its actual
folder convention first (SPEC.md Open Question #1), then implement
`adapters/windsurf.ts`.

**Acceptance criteria:**
- [ ] Convention confirmed against Windsurf's own docs before coding (cite the source)
- [ ] Detection + linking work against a fixture `$HOME`

**Verification:**
- [ ] `bun test tests/integration/windsurf.test.ts` passes

**Dependencies:** Task 5, Task 6

**Files likely touched:**
- `src/adapters/windsurf.ts`
- `tests/integration/windsurf.test.ts`

**Estimated scope:** Small

---

## Task 12: Kiro adapter

**Description:** Same shape as Task 10/11, for Kiro.

**Acceptance criteria:**
- [ ] Convention confirmed against Kiro's own docs before coding (cite the source)
- [ ] Detection + linking work against a fixture `$HOME`

**Verification:**
- [ ] `bun test tests/integration/kiro.test.ts` passes

**Dependencies:** Task 5, Task 6

**Files likely touched:**
- `src/adapters/kiro.ts`
- `tests/integration/kiro.test.ts`

**Estimated scope:** Small

---

## Task 13: `marketplace-exec.ts` shared shell-out primitive

**Description:** Implement `core/marketplace-exec.ts`: run a native CLI
subcommand (via Bun's subprocess API), capture stdout/stderr/exit code, and
raise a `NativeInstallError` with the CLI's own error output verbatim on
non-zero exit. Every native-marketplace adapter builds on this — build it
once, generically, before the first adapter that needs it.

**Acceptance criteria:**
- [ ] A successful command returns its stdout
- [ ] A non-zero exit raises `NativeInstallError` containing the real stderr, not a generic message

**Verification:**
- [ ] `bun test tests/unit/marketplace-exec.test.ts` passes using a fixture shell script as the "native CLI"

**Dependencies:** Task 1

**Files likely touched:**
- `src/core/marketplace-exec.ts`
- `tests/unit/marketplace-exec.test.ts`

**Estimated scope:** Small

---

## Task 14: Claude Code adapter

**Description:** Implement `adapters/claude-code.ts`: detect via
`Bun.which("claude")`, install via
`claude plugin marketplace add <owner>/<repo>` then
`claude plugin install <plugin-name>@<marketplace-name>`, remove via
`claude plugin uninstall <plugin-name>@<marketplace-name>`. Before finishing,
confirm the "self-hosted single-plugin marketplace" pattern (SPEC.md Open
Question #3) — a plugin repo that carries both `.claude-plugin/plugin.json`
and a self-cataloging `.claude-plugin/marketplace.json` — is actually valid
for `claude plugin marketplace add`, since Task 23's scaffold depends on it.

**Acceptance criteria:**
- [ ] Detection returns false when `claude` isn't on `$PATH`, regardless of whether `~/.claude` exists
- [ ] Install runs both commands in order with correct arguments
- [ ] Remove runs the uninstall command with correct arguments
- [ ] The self-hosted-marketplace pattern is verified (or the adapter/scaffold adjusted if it isn't valid)

**Verification:**
- [ ] `bun test tests/integration/claude-code.test.ts` passes using a fake `claude` executable on a fixture `$PATH` that records invocation args

**Dependencies:** Task 13

**Files likely touched:**
- `src/adapters/claude-code.ts`
- `tests/integration/claude-code.test.ts`

**Estimated scope:** Medium

---

## Task 15: Gemini CLI adapter

**Description:** Implement `adapters/gemini.ts`: detect via
`Bun.which("gemini")`, install via
`gemini extensions install https://github.com/<owner>/<repo>` (confirmed).
Confirm the exact `uninstall` syntax (SPEC.md Open Question #2 — not
confirmed during spec research) via `gemini extensions --help` or current
docs before implementing remove; if genuinely unconfirmable at implementation
time, implement install fully and have remove report "not supported yet,
remove manually" rather than guessing a command that might not exist.

**Acceptance criteria:**
- [ ] Install runs the confirmed command with correct arguments
- [ ] Remove either uses a confirmed uninstall command, or clearly reports it's unsupported (no silent no-op, no guessed command)

**Verification:**
- [ ] `bun test tests/integration/gemini.test.ts` passes using a fake `gemini` executable

**Dependencies:** Task 13

**Files likely touched:**
- `src/adapters/gemini.ts`
- `tests/integration/gemini.test.ts`

**Estimated scope:** Small

---

## Task 16: Codex CLI adapter (third-party `codex-marketplace`)

**Description:** Implement `adapters/codex.ts`: detect via
`Bun.which("codex")`, install via
`npx codex-marketplace add <owner>/<repo> --plugin [--global|--project]`,
remove via `npx codex-marketplace remove <plugin> [--global|--project]`.
Per SPEC.md Boundaries, the first time this adapter shells out to the
third-party `codex-marketplace` tool for a given user, surface an explicit
confirmation (it's not an OpenAI-official CLI).

**Acceptance criteria:**
- [ ] Install/remove run the documented `npx codex-marketplace` commands with correct flags
- [ ] First use prompts for consent to invoke the third-party tool; subsequent uses don't re-prompt

**Verification:**
- [ ] `bun test tests/integration/codex.test.ts` passes using a fake `npx`/`codex-marketplace` on a fixture `$PATH`

**Dependencies:** Task 13

**Files likely touched:**
- `src/adapters/codex.ts`
- `tests/integration/codex.test.ts`

**Estimated scope:** Small

---

## Task 17: OpenCode adapter

**Description:** Implement `adapters/opencode.ts`: detect via
`Bun.which("opencode")`, install via `opencode plugin <module> [--global]`
where `<module>` comes from the manifest's `package` field. No confirmed
uninstall CLI verb exists (SPEC.md Open Question #2a) — implement remove as
either a direct edit to `opencode.json`'s `plugin` array (if that's judged
safe during implementation) or a clear "remove manually" message; don't
guess a nonexistent CLI command.

**Acceptance criteria:**
- [ ] Install runs `opencode plugin <package> [--global]` with the manifest's `package` field
- [ ] A manifest missing the `package` field for the `opencode` target fails validation with a clear message (Task 2 should already cover this, wire it through here)
- [ ] Remove behavior is implemented per whichever approach was decided (config edit or manual-removal message) — not a silent no-op

**Verification:**
- [ ] `bun test tests/integration/opencode.test.ts` passes using a fake `opencode` executable

**Dependencies:** Task 13

**Files likely touched:**
- `src/adapters/opencode.ts`
- `tests/integration/opencode.test.ts`

**Estimated scope:** Small

---

## Task 18: Grok CLI adapter

**Description:** Implement `adapters/grok.ts`: detect via
`Bun.which("grok")`. Confirm exact argument shape via `grok plugin --help`
/ `grok plugin marketplace --help` (SPEC.md Open Question #2c — subcommands
confirmed to exist, arguments weren't) before finalizing install/remove:
`grok plugin marketplace add <source>` then `grok plugin install <name>`
(or `<name>@<marketplace>`), `grok plugin uninstall <name>`.

**Acceptance criteria:**
- [ ] Argument shape confirmed via `--help` output or current docs, not assumed
- [ ] Install/remove run the confirmed commands with correct arguments

**Verification:**
- [ ] `bun test tests/integration/grok.test.ts` passes using a fake `grok` executable

**Dependencies:** Task 13

**Files likely touched:**
- `src/adapters/grok.ts`
- `tests/integration/grok.test.ts`

**Estimated scope:** Small

---

## Task 19: Per-adapter `contextFile` resolution

**Description:** Implement `core/context-file.ts`: given an agent id and
scope, return the best-known "memory/context markdown file" path — confirmed
for Claude Code (`~/.claude/CLAUDE.md` / `<project>/CLAUDE.md`) and Gemini
(`~/.gemini/GEMINI.md`, project path unconfirmed — verify before finalizing),
falling back to the generic `.agents` convention's `AGENTS.md`
(`~/AGENTS.md` / `<project>/AGENTS.md`) for every other adapter until each
is researched (SPEC.md Open Question #8).

**Acceptance criteria:**
- [ ] `claude-code`/global resolves to `~/.claude/CLAUDE.md`, `claude-code`/project to `<project>/CLAUDE.md`
- [ ] `gemini`/global resolves to `~/.gemini/GEMINI.md`
- [ ] Any adapter with no confirmed convention resolves to the `AGENTS.md` fallback, not a guessed filename

**Verification:**
- [ ] `bun test tests/unit/context-file.test.ts` passes

**Dependencies:** Task 1

**Files likely touched:**
- `src/core/context-file.ts`
- `tests/unit/context-file.test.ts`

**Estimated scope:** Small

---

## Task 20: Postinstall/postremove execution + `upsertBlock` + consent

**Description:** Implement `core/postinstall.ts`: run a plugin's
`postinstall.ts`/`postremove.ts` (if declared) with the `PostInstallContext`
from SPEC.md, expose an `upsertBlock(filePath, content)` helper that
writes/replaces a `<!-- maui:<plugin-name>:start/end -->`-delimited block,
and prompt for consent before first running any plugin's hook (re-prompting
if the script's content changed since the last confirmed run, tracked via a
content hash in the registry).

**Acceptance criteria:**
- [ ] `upsertBlock` inserts a marked block on first call and replaces (not duplicates) it on a second call
- [ ] First run of a plugin's `postinstall` prompts for consent; a second `install`/`update` with an unchanged script doesn't re-prompt
- [ ] A changed script (different content hash) re-prompts on the next `update`

**Verification:**
- [ ] `bun test tests/unit/postinstall.test.ts` passes

**Dependencies:** Task 3, Task 19

**Files likely touched:**
- `src/core/postinstall.ts`
- `tests/unit/postinstall.test.ts`

**Estimated scope:** Medium

---

## Task 21: Wire postinstall/postremove into install/remove flow

**Description:** Call `postinstall` once per successfully-installed
agent+scope pairing at the end of `maui install` (for both symlink and
native-marketplace adapters), and `postremove` before `maui remove` strips
a plugin's other artifacts for that pairing — falling back to maui's own
automatic block-stripping (from the registry's tracked `contextFile`
writes) when no `postremove` is declared.

**Acceptance criteria:**
- [ ] Installing a plugin with a `postinstall.ts` that calls `upsertBlock` results in the block appearing in the correct `contextFile` for each installed agent
- [ ] Removing that plugin strips the block from every file it was written to, with no `postremove` defined
- [ ] A plugin with neither hook installs/removes exactly as before this task (no regression, no prompt)

**Verification:**
- [ ] `bun test tests/integration/postinstall-flow.test.ts` passes, covering the exact CLAUDE.md/GEMINI.md/AGENTS.md scenario from SPEC.md's Success Criteria

**Dependencies:** Task 6, Task 14, Task 20

**Files likely touched:**
- `src/cli/install.ts`, `src/cli/remove.ts`
- `tests/integration/postinstall-flow.test.ts`

**Estimated scope:** Medium

---

## Task 22: `--scope project` support

**Description:** Thread `--scope project` through `install`/`link`/`unlink`
for symlink adapters (native-marketplace adapters use their own scope
flags, already handled per-adapter): resolve project-local target roots
instead of home-directory ones, and record linked plugins in
`<project>/.maui/config.json` so `maui install` with no args in that project
reproduces the same set.

**Acceptance criteria:**
- [ ] `maui install <source> --scope project` links into `./.claude/...` etc. instead of `~/.claude/...`
- [ ] The choice is recorded in `<project>/.maui/config.json`
- [ ] Running `maui install` with no arguments in a project containing that config file reproduces the same linked set

**Verification:**
- [ ] `bun test tests/integration/project-scope.test.ts` passes against a fixture project directory

**Dependencies:** Task 6, Task 9

**Files likely touched:**
- `src/core/registry.ts` (project config read/write)
- `src/cli/install.ts`
- `tests/integration/project-scope.test.ts`

**Estimated scope:** Medium

---

## Task 23: `maui create <plugin-name>`

**Description:** Implement `core/scaffold.ts` and the `maui create` CLI
command per SPEC.md's Plugin Scaffolding section: prompt for GitHub
username, plugin name, description, license; create the common folders with
`.gitkeep`; generate `.claude-plugin/plugin.json` + `marketplace.json`,
`.codex-plugin/plugin.json`, `gemini-extension.json`, `maui.json`, and a
Bun-compatible `package.json` with a `version:bump` script that updates the
version across all generated manifests; `git init` the new repo without
pushing or creating a remote.

**Acceptance criteria:**
- [ ] Running `maui create my-plugin` and answering the prompts produces the full folder/file layout from SPEC.md
- [ ] `version:bump` updates `version` consistently across `package.json`, `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, `gemini-extension.json`, and `maui.json`
- [ ] The generated repo is git-initialized but has no remote and no commits pushed

**Verification:**
- [ ] `bun test tests/integration/scaffold.test.ts` passes
- [ ] Manual check: the generated repo installs cleanly with `maui install ./my-plugin` (local path)

**Dependencies:** Task 2, Task 14 (needs the confirmed self-hosted-marketplace pattern)

**Files likely touched:**
- `src/core/scaffold.ts`
- `src/cli/create.ts`
- `tests/integration/scaffold.test.ts`

**Estimated scope:** Medium

---

## Task 24: `maui update`

**Description:** For symlink-cached plugins, pull the latest commit into
`~/.maui/plugins/<name>` and confirm every previously-linked agent reflects
the change with no re-linking needed (since links point at the cache, not a
copy). For native-marketplace agents, defer to that agent's own update
command where one exists (e.g. `claude plugin marketplace update`).

**Acceptance criteria:**
- [ ] `maui update <name>` pulls latest for a symlink-cached plugin and existing symlinks still resolve correctly with no relink step
- [ ] For a plugin installed on a native-marketplace agent, `update` invokes that agent's own update command instead of touching maui's cache

**Verification:**
- [ ] `bun test tests/integration/update.test.ts` passes

**Dependencies:** Task 4, Task 14

**Files likely touched:**
- `src/cli/update.ts`
- `tests/integration/update.test.ts`

**Estimated scope:** Small
