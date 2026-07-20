# Task List: maui

## Task 18b: Wire all adapters into installPlugin/removePlugin orchestration ✅ done

**Added mid-build:** Tasks 6/10-18 each built one adapter and tested it in
isolation (`linkPlugin`/adapter functions directly), but nothing looped
over *every* target in a manifest and dispatched to whichever adapter (and
scope) applied — the Phase 4-5 checkpoint ("`maui install` on a machine
with multiple agents detected produces the right outcome per agent, with
undetected agents skipped and reported") had no task actually building it.

**What changed:**
- `GlobalSymlinkAdapter` gained an optional `detect(home)` — omitted means
  always-present (the `.agents` fallback), present means gate linking on it
  (Kiro: does `~/.kiro` exist).
- New `getNativeMarketplaceAdapter(agentId)` registry alongside the
  existing symlink one.
- `installPlugin()` now loops over every `manifest.targets` entry,
  dispatching to the native-marketplace or symlink path per entry,
  detecting first and recording what got skipped and why.
- `removePlugin()` now calls the matching native adapter's `remove()` for
  `kind: "native-marketplace"` entries, using an `identity` object
  persisted on the registry entry at install time (not re-derived from a
  possibly-changed manifest at remove time).

**Verification:** `bun test tests/integration/install-multi-agent.test.ts`
— a manifest with a native-marketplace target (fake `claude` on `$PATH`), a
detected-vs-undetected symlink target (Kiro), and the always-on fallback,
proving detected agents install, undetected ones are skipped and reported,
and remove runs the real uninstall command.

---

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

## Task 8: `maui remove` (symlink path) + `--purge` ✅ done

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

## Task 9: `maui link` / `maui unlink` ✅ done

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

## Task 10: Cursor adapter ✅ done (project scope only, as planned)

**Research finding (cursor.com/docs/context/rules):** project-level rules
(`.cursor/rules/*.mdc`) are a real directory of files and fit the existing
`linkChildren` model fine. But Cursor's **global** "User Rules" are managed
through Cursor's UI/database — there is no filesystem folder for them.
Only `~/.cursor/mcp.json` is confirmed to exist globally (for MCP servers),
not rules.

**Decision (user-confirmed):** don't build a dedicated global-scope
`GlobalSymlinkAdapter` for Cursor — the always-on `.agents/rules/` fallback
(Task 6) already covers the global case for any tool that reads it by
convention. Cursor's only real remaining work is its project-scope target
(`.cursor/rules/`), which is implemented as part of/after Task 22 once
project-scope resolution exists, instead of a standalone global-only task.

**Acceptance criteria (once picked up after Task 22):**
- [ ] `.cursor/rules/` in a project gets the plugin's mapped rules per-child-symlinked, using project-scope resolution
- [ ] No global-scope Cursor adapter is registered — global installs rely solely on the `.agents` fallback

**Files likely touched:**
- `src/adapters/cursor.ts`
- `tests/integration/cursor.test.ts`

**Estimated scope:** Small

---

## Task 11: Windsurf adapter ✅ done (project scope only, as planned)

**Research finding (docs.devin.ai/desktop/cascade/memories, Windsurf/Devin
merged docs):** project-level rules (`.windsurf/rules/*.md` or
`.devin/rules/*.md`) are a real directory of files and fit the existing
model. Windsurf's **global** rules do have a confirmed filesystem path —
`~/.codeium/windsurf/memories/global_rules.md` — but it's a single shared
file, not a directory, so it doesn't fit `linkChildren`'s per-child-symlink
model at all; merging content into it is the same kind of problem Task
19-21's `contextFile`/`upsertBlock` mechanism solves for CLAUDE.md/GEMINI.md.

**Decision (user-confirmed):** same as Cursor — no dedicated global-scope
adapter for now; the `.agents/rules/` fallback covers the global case.
Windsurf's project-scope target (`.windsurf/rules/`) is implemented as part
of/after Task 22. Revisit `global_rules.md` support later using the
postinstall/`upsertBlock` machinery, not the directory-symlink adapter path.

**Acceptance criteria (once picked up after Task 22):**
- [ ] `.windsurf/rules/` in a project gets the plugin's mapped rules per-child-symlinked, using project-scope resolution
- [ ] No global-scope Windsurf adapter is registered — global installs rely solely on the `.agents` fallback

**Files likely touched:**
- `src/adapters/windsurf.ts`
- `tests/integration/windsurf.test.ts`

**Estimated scope:** Small

---

## Task 12: Kiro adapter ✅ done

**Research finding (kiro.dev/docs/steering/):** both project (`.kiro/steering/`)
and global (`~/.kiro/steering/`) conventions are confirmed, real directories
of files — fits the existing `GlobalSymlinkAdapter`/`linkChildren` model
directly, no design changes needed. (Global takes lower priority than
workspace steering when both exist, per Kiro's own docs — not maui's
concern since maui just places files.)

**Acceptance criteria:**
- [x] Convention confirmed against Kiro's own docs before coding (cite the source)
- [ ] Detection + linking work against a fixture `$HOME`

**Verification:**
- [ ] `bun test tests/integration/kiro.test.ts` passes

**Dependencies:** Task 5, Task 6, Task 9 (adapter registry)

**Files likely touched:**
- `src/adapters/kiro.ts`
- `src/adapters/registry.ts`
- `tests/integration/kiro.test.ts`

**Estimated scope:** Small

---

## Task 13: `marketplace-exec.ts` shared shell-out primitive ✅ done

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

## Task 14: Claude Code adapter ✅ done

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

## Task 15: Gemini CLI adapter ✅ done

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

## Task 16: Codex CLI adapter (third-party `codex-marketplace`) ✅ done

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

## Task 17: OpenCode adapter ✅ done

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

## Task 18: Grok CLI adapter ✅ done

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

## Task 19: Per-adapter `contextFile` resolution ✅ done

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

## Task 20: Postinstall/postremove execution + `upsertBlock` + consent ✅ done

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

## Task 21: Wire postinstall/postremove into install/remove flow ✅ done

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

## Task 22: `--scope project` support ✅ done (native-marketplace project scope out of scope, see note)

**Description:** Thread `--scope project` through `install`/`link`/`unlink`
for symlink adapters (native-marketplace adapters use their own scope
flags, already handled per-adapter): resolve project-local target roots
instead of home-directory ones, and record linked plugins in
`<project>/.maui/config.json` so `maui install` with no args in that project
reproduces the same set.

**Acceptance criteria:**
- [x] `maui install <source> --scope project` links into `./.agents/...` (and
      `./.kiro/steering/...` when detected) instead of the `~/`-rooted paths
      — the original wording ("`./.claude/...`") assumed Claude Code was a
      symlink target; it's native-marketplace, so that specific example no
      longer applies (see gap note below)
- [x] The choice is recorded in `<project>/.maui/config.json`
- [x] Running `maui install` with no arguments in a project containing that
      config file reproduces the same linked set

**Known gap:** native-marketplace adapters (Claude Code, Codex, Gemini,
OpenCode, Grok) don't yet support `--scope project` — their `install()`
signature has no scope parameter, and each would need its own scope-flag
wiring (`claude plugin install --scope project`, `codex-marketplace add
--project`, etc.). `installPlugin` explicitly skips native-marketplace
targets at project scope (reported in `skipped`, not silently mis-installed
at the wrong scope) rather than guessing. Follow-up work, not blocking.

**Verification:**
- [x] `bun test tests/integration/project-scope.test.ts` passes against a fixture project directory

**Dependencies:** Task 6, Task 9

**Files touched:**
- `src/core/project-config.ts` (new)
- `src/adapters/generic-agents.ts`, `src/adapters/kiro.ts`, `src/adapters/registry.ts` (`projectRoot`)
- `src/cli/install.ts`, `src/cli/index.ts`
- `src/types.ts` (`InstalledAgentEntry.projectRoot`)
- `tests/integration/project-scope.test.ts`

**Estimated scope:** Medium

---

## Task 23: `maui create <plugin-name>` ✅ done

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

## Task 24: `maui update` ✅ done

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

---

## Task 25: `scaffoldMarketplace()` — repo-shell scaffold ✅ done

**Description:** Implement `scaffoldMarketplace(options)` in `core/scaffold.ts`
(or a new `core/marketplace-scaffold.ts` if that keeps the file size
sane): prompts are gathered by the CLI layer (Task 27), this function takes
plain options and generates the repo shell per SPEC.md's
`create-marketplace` section — `.claude-plugin/marketplace.json` (with
`owner`, `metadata.description`/`metadata.version`, empty `plugins: []`),
`.agents/plugins/marketplace.json` (`name`, empty `plugins: []`),
`gemini-extension.json` (`name`, `version`, `description`,
`contextFileName: "AGENTS.md"`), `plugins/.gitkeep`, `package.json` +
`scripts/bump-version.ts` scoped to the marketplace-level files, `git init`.
Also add the `owner` field to the *existing* standalone single-plugin
`scaffoldPlugin()`'s self-hosted `marketplace.json` generation, since it's
the same field found missing in both places.

**Acceptance criteria:**
- [ ] `.claude-plugin/marketplace.json` has `owner.name`, `metadata.version: "0.1.0"`, `plugins: []`
- [ ] `.agents/plugins/marketplace.json` has `name` and `plugins: []`
- [ ] `gemini-extension.json` has `contextFileName: "AGENTS.md"` alongside name/version/description
- [ ] `plugins/.gitkeep` exists so the empty folder commits to git
- [ ] `scripts/bump-version.ts` updates `package.json`, `.claude-plugin/marketplace.json`'s `metadata.version`, and `gemini-extension.json`'s `version`; skips `.agents/plugins/marketplace.json` gracefully if it has no top-level `version` key (it doesn't, per the reference repo — don't invent one)
- [ ] `git init` run, no remote, no commits
- [ ] Existing standalone `scaffoldPlugin()`'s self-hosted marketplace.json now also has an `owner` field (small addition, existing `scaffold.test.ts` coverage should still pass plus one new assertion)

**Verification:**
- [ ] `bun test tests/integration/marketplace-scaffold.test.ts` passes
- [ ] `bun test tests/integration/scaffold.test.ts` still passes (regression check on the `owner` field addition)

**Dependencies:** Task 23 (builds on the existing `scaffoldPlugin`/scaffold test patterns)

**Files likely touched:**
- `src/core/scaffold.ts`
- `tests/integration/marketplace-scaffold.test.ts`
- `tests/integration/scaffold.test.ts` (owner-field assertion)

**Estimated scope:** Medium

---

## Task 26: `create-plugin` marketplace-mode detection + append-to-existing-manifests ✅ done

**Description:** Extend `scaffoldPlugin()` to detect an existing marketplace
project before deciding what to generate: check for
`<cwd>/.claude-plugin/marketplace.json`. If absent, behave exactly as
today (standalone mode, unchanged — this must not regress). If present,
switch to marketplace mode: create `plugins/<plugin-name>/` with only
`.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, and the common
source folders — no per-plugin `marketplace.json`, `gemini-extension.json`,
or `maui.json`. Append `{ name, source: "./plugins/<name>", description,
version, author }` to the root `.claude-plugin/marketplace.json`'s
`plugins` array (matched/replaced by `name`, not blindly pushed — running
`create-plugin` twice for the same name must update in place, not
duplicate). Do the same for `.agents/plugins/marketplace.json` if it
exists, using its own schema (`name`, `source: "./plugins/<name>"` as a
plain string — no `policy`/`category`, per SPEC.md's explicit note that
those aren't confirmed as standard). Generate a per-plugin
`package.json` + `scripts/bump-version.ts` that bumps this plugin's own
`package.json`/`.claude-plugin/plugin.json`/`.codex-plugin/plugin.json`
*and* updates this plugin's matching entry inside both shared marketplace
files — never touches the marketplace's own `metadata.version`.

**Acceptance criteria:**
- [ ] No existing `.claude-plugin/marketplace.json` in cwd → identical output to today's `scaffoldPlugin` (regression guard)
- [ ] Existing marketplace present → `plugins/<name>/` created with only plugin.json/.codex-plugin/plugin.json + common folders, no marketplace.json/gemini-extension.json/maui.json inside it
- [ ] Root `.claude-plugin/marketplace.json`'s `plugins` array gets a new entry for the plugin, with `source: "./plugins/<name>"`
- [ ] `.agents/plugins/marketplace.json`'s `plugins` array gets a matching entry, if that file exists
- [ ] Running `create-plugin` a second time with a **different** plugin name adds a second entry without disturbing the first (this is the actual "no manual effort" proof)
- [ ] Running `create-plugin` again with the **same** plugin name updates that one entry in place, not a duplicate
- [ ] The per-plugin `version:bump` script updates the plugin's own files *and* its entry in both shared marketplace files, and does not touch `metadata.version`

**Verification:**
- [ ] `bun test tests/integration/create-plugin-marketplace-mode.test.ts` passes, including the two-plugins-no-collision case and the version-bump-syncs-marketplace-entry case (actually running the generated script, per the existing `scaffold.test.ts` pattern of executing `bump-version.ts` as a real subprocess rather than just checking it was written)

**Dependencies:** Task 25

**Files likely touched:**
- `src/core/scaffold.ts`
- `tests/integration/create-plugin-marketplace-mode.test.ts`

**Estimated scope:** Medium

---

## Task 27: CLI wiring — `create-plugin`, `create-marketplace`, `create` dispatcher ✅ done

**Description:** Rename the CLI's `create` subcommand handling so
`create-plugin <plugin-name>` and `create-marketplace <marketplace-name>`
are both real subcommands (mirroring today's `runCreate`, one calling
`scaffoldPlugin`/`createPlugin`, the other calling the new
`scaffoldMarketplace`/`createMarketplace`). `create <name>` becomes a thin
dispatcher: prompts "Is this a single-plugin repo or a multi-plugin
marketplace repo?" (injectable prompt, same pattern as `createPlugin`'s
existing prompt injection) and calls one of the two based on the answer —
no third scaffolding implementation.

**Acceptance criteria:**
- [ ] `maui create-plugin <name>` works standalone (same CLI-level behavior as today's `maui create`)
- [ ] `maui create-marketplace <name>` works standalone
- [ ] `maui create <name>` prompts single-vs-multi and dispatches correctly to each, with no independent scaffolding logic of its own
- [ ] `maui help` / command list reflects all three subcommands

**Verification:**
- [ ] `bun test tests/unit/cli-create.test.ts` passes (extended with `create-marketplace` and dispatcher cases)
- [ ] `bun run lint` / `bun run build` clean

**Dependencies:** Task 25, Task 26

**Files likely touched:**
- `src/cli/create.ts`
- `src/cli/commands.ts` (command list)
- `src/cli/index.ts`
- `tests/unit/cli-create.test.ts`

**Estimated scope:** Small

---

## Task 28: End-to-end verification against SPEC.md's two-plugin success criterion ✅ done (found and fixed a real readline bug)

**Description:** Not a new unit — a manual verification pass proving the
literal SPEC.md Success Criterion: `create-marketplace` a repo, run
`create-plugin` twice from inside it for two different plugin names,
confirm both are independently listed in `.claude-plugin/marketplace.json`
with correct `source` paths and zero manual JSON edits. This is the same
kind of manual check that caught the real partial-install-failure bug
during Task 23 — worth doing for real, not just trusting the unit tests.

**Acceptance criteria:**
- [ ] Two plugins scaffolded into the same marketplace repo, both present in `.claude-plugin/marketplace.json` and `.agents/plugins/marketplace.json` with correct entries
- [ ] No manual file edits were needed between the two `create-plugin` runs
- [ ] `git status` inside the scaffolded repo shows no unexpected/corrupted files (e.g. marketplace.json is still valid JSON, not double-written)

**Verification:** manual, via Bash — no new automated test expected, though any bug found gets a regression test added to Task 26's suite before this is marked done.

**What actually happened:** the two-plugin marketplace scaffolding itself
worked correctly on the first try — both plugins independently listed in
both marketplace manifests, correct `source` paths, no duplication, correct
per-plugin folder contents, no marketplace.json/gemini-extension.json/
maui.json leaking into plugin folders. But driving it through the *real*
CLI with real piped stdin (not injected test doubles) surfaced an
unrelated, pre-existing bug: `node:readline/promises`' `question()` method
silently drops buffered input between sequential calls when stdin is piped
rather than a real TTY — confirmed hanging forever on the *second* question
of any multi-question prompt flow, under both Bun and real Node. This
affected all four places in the codebase using that pattern (`create.ts`,
`remove.ts`, `codex.ts`, `postinstall.ts`), none of which any existing unit
test could catch, since every test injects a fake `prompt`/`confirm`
function and never exercises the real default. Fixed by replacing all four
with a shared `core/prompt.ts` built directly on the `'line'` event instead
(confirmed correct for both piped-all-at-once and genuinely interactive
input), with a real subprocess-based regression test
(`tests/integration/prompt.test.ts`) that would have caught this — exactly
what manual end-to-end verification is for.

**Dependencies:** Task 27

**Files touched:**
- `src/core/prompt.ts` (new)
- `src/cli/create.ts`, `src/cli/remove.ts`, `src/adapters/codex.ts`, `src/core/postinstall.ts`
- `tests/integration/prompt.test.ts` (new)

**Estimated scope:** Small

---

## Task 29: Confirm Claude Code's self-hosted single-plugin marketplace pattern ✅ done

**Description:** Independently verify, against Claude Code's own docs
(code.claude.com/docs), that a repo can catalog itself for
`claude plugin marketplace add <owner>/<repo>` by shipping both
`.claude-plugin/plugin.json` and a self-referencing
`.claude-plugin/marketplace.json` (`plugins: [{ name, source: "." }]`) —
the exact pattern `scaffoldStandalonePlugin` (`src/core/scaffold.ts`) has
generated since Phase 5, never independently confirmed until now. This runs
first in this phase because everything else here is independent, but a
wrong answer here means fixing already-shipped scaffold output.

**Acceptance criteria:**
- [ ] If confirmed: SPEC.md's Open Question #3 rewritten as resolved, with the doc citation
- [ ] If not confirmed / found incorrect: `scaffoldStandalonePlugin` (and `claude-code.ts`'s install command, if that's what's wrong) corrected to the actually-valid pattern
- [ ] No regression in the existing single-plugin / marketplace-mode scaffold tests

**Verification:**
- [x] `bun test tests/integration/scaffold.test.ts` passes
- [x] `bun run build && bun run lint` clean

**What actually happened:** confirmed correct on the first try — no code
change needed. Claude Code's own marketplace-authoring docs
(code.claude.com/docs/en/plugin-marketplaces) explicitly document
`source: "."` as a distinct, validated value meaning "the plugin lives at
the marketplace root" (its validator section literally says the per-entry
validation pass "includes plugins whose `source` is `.`" as of v2.1.196).
`scaffold.ts`'s `scaffoldStandalonePlugin` already emits exactly this.
Noted one non-blocking fact for the record: earlier Claude Code versions
"skip plugins at the marketplace root and only descend from a
`.claude-plugin/marketplace.json`" — a version-floor consideration, not a
correctness bug in the scaffold.

**Dependencies:** None

**Files touched:**
- `SPEC.md` (Open Question #3 rewritten as resolved, with citation)

**Estimated scope:** Small

---

## Task 30: Confirm Gemini's uninstall syntax and project-scope contextFile path ✅ done

**Description:** `geminiAdapter.remove()` (`src/adapters/gemini.ts`)
currently throws `UnsupportedRemovalError` because no non-interactive
`gemini extensions uninstall` equivalent was found during the original spec
research. Re-check Gemini CLI's own docs for a confirmed non-interactive
uninstall command; implement it if one exists. Also confirm (or refute) the
project-scope `<project>/GEMINI.md` contextFile path in
`src/core/context-file.ts`, currently assumed by symmetry with the
confirmed global `~/.gemini/GEMINI.md` path but never independently checked.

**Acceptance criteria:**
- [x] If a non-interactive uninstall command is confirmed: `geminiAdapter.remove()` implements it (mirrors `claudeCodeAdapter.remove()`'s shape), with a failing-then-passing integration test proving it
- [x] Gemini's project-scope `contextFile` entry: not corrected, and not marked confirmed either — the new source addressed a different concept (an extension's own bundled `GEMINI.md`, not the general project memory file); left genuinely unconfirmed, folded into Task 33

**Verification:**
- [x] `bun test` (full suite) passes — 131 tests, no regressions
- [x] `remove()` changed: new test failed before the fix (asserted the old `UnsupportedRemovalError`'s replacement), passed after

**What actually happened:** `gemini extensions uninstall <name>` is
confirmed real and non-interactive at
google-gemini.github.io/gemini-cli/docs/extensions/ — a different, more
complete page than the one originally checked
(geminicli.com/docs/reference/commands). `geminiAdapter.remove()` now runs
it. The project-scope `GEMINI.md` contextFile question stayed open: the
new source's mention of `GEMINI.md` turned out to describe a per-extension
bundled file loaded by that extension itself, not the general
`postinstall`-context memory file maui cares about — a different concept
entirely, so nothing to correct or confirm from it either way.

**Dependencies:** None

**Files touched:**
- `SPEC.md`
- `src/adapters/gemini.ts`
- `tests/integration/gemini.test.ts`

**Estimated scope:** Small

---

## Task 31: Confirm Grok CLI argument shapes

**Description:** `src/adapters/grok.ts`'s install/remove argument
construction (`<name>@<marketplace>` qualifiers, bare `owner/repo` for
`marketplace add`) was built by analogy to Claude Code's confirmed shape,
explicitly flagged in the file's own comment as unconfirmed. Re-check
docs.x.ai/build/cli/reference for the actual argument formats: owner/repo
shorthand vs. full URL for `marketplace add`; whether `install`/`uninstall`
need the `<name>@<marketplace>` qualifier or just `<name>`; scope flags.
Also resolve the minor open sub-question of whether Grok's skill loader
reads `.agents/skills/` the way OpenCode's does.

**Acceptance criteria:**
- [ ] If research contradicts the current by-analogy shape: `grok.ts` and its test are corrected (TDD — failing test first)
- [ ] If research confirms the current shape: the code comment is updated from "by analogy" to "confirmed," citing the source
- [ ] SPEC.md's Open Question #2c rewritten as resolved either way, including a definitive answer (not "don't rely on this until verified") for the `.agents/skills/` sub-question

**Verification:**
- [ ] `bun test` on Grok's integration test file passes
- [ ] `bun run build && bun run lint` clean

**Dependencies:** None

**Files likely touched:**
- `SPEC.md`
- `src/adapters/grok.ts`
- Grok's integration test file

**Estimated scope:** Small, unless the argument shape is wrong (then Medium — it's a live behavior change)

---

## Task 32: Decide GitHub Copilot / Antigravity adapter scope

**Description:** Neither GitHub Copilot nor Antigravity has a dedicated
maui adapter today — both fall through to the generic `_default` `.agents`
fallback. Research whether either tool actually has a scriptable,
non-interactive plugin/extension-install CLI worth building an adapter
around. Recommended default absent such a finding: explicitly decide "no
dedicated adapter for v1," since the `.agents` fallback already covers any
undetected/unlisted agent fully — this task's job is to make that decision
explicit in SPEC.md, not to speculatively build an adapter for a tool with
no confirmed automation surface.

**Acceptance criteria:**
- [ ] SPEC.md's Open Question #1 (the GitHub Copilot/Antigravity portion) rewritten as an explicit decision with rationale, not left open
- [ ] If a scriptable CLI *is* found for either tool: do NOT implement the adapter in this task — stop and report back so a new, separate follow-up task can be scoped for it (same shape as Tasks 13–18)

**Verification:**
- [ ] SPEC.md reads internally consistent — no code changes expected

**Dependencies:** None

**Files likely touched:**
- `SPEC.md` only (expected)

**Estimated scope:** Small

---

## Task 33: Fill in remaining contextFile conventions

**Description:** `CONTEXT_FILES` in `src/core/context-file.ts` only has
confirmed entries for `claude-code`, `gemini`, and `opencode` — Codex,
Grok, Cursor, and Windsurf/Kiro all currently fall back to the generic
`AGENTS.md` convention. Research each remaining agent's own "memory"/
instructions-file convention (does Codex have one beyond `AGENTS.md`? does
Grok? does Cursor have a single memory file, or only the already-handled
`.cursor/rules/` directory? is Windsurf/Cascade's `global_rules.md` — noted
in `windsurf.ts` as not directory-shaped — still worth a `contextFile`
entry for postinstall purposes even though it's not a symlink target?).

**Acceptance criteria:**
- [ ] Each **confirmed** convention gets an entry in `CONTEXT_FILES` (same shape as existing entries), a matching row in SPEC.md's contextFile table, and a unit test in `tests/unit/context-file.test.ts`
- [ ] Anything that stays unconfirmed after real research stays on the `AGENTS.md` fallback — no guessed filenames — but SPEC.md's wording changes to reflect that it was actually checked this time, not just "unconfirmed"

**Verification:**
- [ ] `bun test tests/unit/context-file.test.ts` passes with new cases
- [ ] Full `bun test` suite still green

**Dependencies:** None

**Files likely touched:**
- `SPEC.md`
- `src/core/context-file.ts`
- `tests/unit/context-file.test.ts`

**Estimated scope:** Small

---

## Task 34: Resolve the remaining decision-only Open Questions (#4, #5, #6, #7) ✅ done

**Description:** Four open questions need no research, only a documented
product decision — they've sat open since the original spec despite being
pure scope calls. Resolve each explicitly in SPEC.md:
- **#4** (built-in registry/index of known-good plugins): defer past v1 —
  "any git URL with a `maui.json`" stays sufficient; a curated index adds
  ongoing maintenance/trust-review overhead not needed yet.
- **#5** (versioning/pinning — pinned git ref vs. always-latest,
  `update --check`/dry-run): defer past v1 as its own future feature/plan
  cycle, not bundled into this cleanup — it's a real feature, not a
  documentation gap.
- **#6** (`bun build --compile` standalone binary): defer — the
  `bunx`/`bun add -g github:<owner>/maui` distribution path already covers
  installation without adding a second distribution channel.
- **#7** (CLI argument-parsing library): mark **resolved**, not deferred —
  the hand-rolled `Bun.argv` parsing already live throughout
  `src/cli/index.ts` (`parseInstallArgs`, `parseRemoveArgs`, etc.) *is* the
  decision; the wording just needs to say so instead of "TBD."

**Acceptance criteria:**
- [x] SPEC.md's Open Questions #4, #5, #6, #7 each read as an explicit resolution/decision with stated rationale — none left as a bare question
- [ ] No dangling "TBD" or open-question framing remains for #1–#8 as a whole — **not yet**, this is the whole-phase checkpoint and still awaits Tasks 30–33 (see note below)

**Verification:**
- [x] Manual read-through of SPEC.md's Open Questions section — #4–#7 confirmed resolved
- [ ] `grep -n "unconfirmed\|not found\|TBD" SPEC.md` shows nothing tied to #1–#8 — still pending on #2/#2c/#8

**What actually happened:** ran out of order — a persistent WebFetch/
WebSearch 529 (server overloaded) blocked Tasks 30–33's research partway
through the autonomous run, so this pure-decision task (no research needed)
was pulled forward to make progress while waiting. Its own scope (#4–#7)
is fully done; the phase-wide checkpoint claim is not, until 30–33 resume
and finish.

**Dependencies:** None (reordered ahead of Tasks 30–33 due to an external
tool outage — see note above)

**Files likely touched:**
- `SPEC.md` only

**Estimated scope:** Small
