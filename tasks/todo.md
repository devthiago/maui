# Task List: maui

## Task 49: `create-plugin` marketplace mode generates a per-plugin `maui.json`

**Description:** `scaffoldPluginInMarketplace` (`src/core/scaffold.ts`,
~line 337) generates `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`,
`package.json`, and `scripts/bump-version.ts` for a plugin added to an
existing marketplace repo, but never a `maui.json` — a documented gap (see
`tests/integration/create-plugin-marketplace-mode.test.ts` lines 38-40,
which currently *asserts* it's absent). Fix this: generate a per-plugin
`maui.json` with the same pre-wired targets as the standalone scaffold
(`marketplace: true` for claude-code/codex/gemini/grok, symlink mappings for
cursor/windsurf/kiro/`_default`), but derive `repo`/`marketplaceName` from
the **root** `.claude-plugin/marketplace.json`'s own `name`/`owner.name`
fields (read at scaffold time) rather than from `options.githubUser`/
`options.pluginName` alone — those describe the plugin, not the repo it
lives in. Also extend `pluginInMarketplaceBumpVersionScript(pluginName)` to
bump this new `maui.json`'s `version` field alongside the files it already
bumps.

**Acceptance criteria:**
- [ ] `plugins/<name>/maui.json` exists after marketplace-mode `create-plugin`, `name`/`version` matching the plugin's own `.claude-plugin/plugin.json`
- [ ] `targets["claude-code"].repo`/`marketplaceName` match the root marketplace.json's owner/name, not the plugin's own name
- [ ] Existing standalone-mode scaffold regression guard (same test file) is unaffected
- [ ] The per-plugin `version:bump` script also bumps the new `maui.json`'s `version`

**Verification:**
- [ ] `bun test tests/integration/create-plugin-marketplace-mode.test.ts` (flip the "no maui.json" assertion, add new coverage)
- [ ] `bun test` (full suite regression)

**Dependencies:** None — independent of Tasks 36–48, can ship any time

**Files likely touched:**
- `src/core/scaffold.ts`
- `tests/integration/create-plugin-marketplace-mode.test.ts`

**Estimated scope:** Medium

---

## Task 48: `maui remove --purge` — fix cache-dir key bug + sibling-check ✅ done

**Description:** `removePlugin`'s purge branch (`src/cli/remove.ts:73`) does
`rm(join(pluginsRoot(home), name), ...)` — keyed by the plugin's own
registry name. Correct today only because cache dirs happen to be named
after the plugin; once marketplace-mode plugins share one clone named after
the *marketplace* (Task 36's `sourceRepo`), this silently rm's a path that
never existed (swallowed by `force: true`), leaking the real clone forever.
Fix: purge via `resolvePluginCacheDir(entry, home)` instead. Before that, add
a sibling-check — after this plugin's own registry entry is removed/updated,
scan remaining `registry.plugins` for any other entry whose `sourceRepo`
matches; if one exists, skip the `rm` entirely (report why) regardless of
`--purge` or the existing "still linked elsewhere" confirm prompt — only
proceed to delete when this plugin is the last one referencing that cache
dir.

**Acceptance criteria:**
- [x] Purging a marketplace-mode plugin whose siblings are still installed leaves the shared clone on disk, with a clear message explaining why
- [x] Purging the last plugin referencing a shared clone actually deletes it — assert the directory is gone, not just that `rm` didn't throw (proves the bug is fixed)
- [x] Purging a single-plugin (non-marketplace) install is unchanged from today (regression) — existing `tests/integration/remove.test.ts` passes unmodified

**What actually happened:** `removePlugin`'s return type changed from `Promise<void>` to `Promise<RemoveResult>` (`{pluginName, purged, purgeSkipped?}`) to carry the "why" message the plan's acceptance criteria required — a safe, backward-compatible change since no existing caller (test or `runRemove`) checked the previous `void` return. `runRemove` in `src/cli/index.ts` now prints "Purged cached source."/"Purge skipped: ..." accordingly.

**Verification:**
- [x] `bun test tests/integration/remove-marketplace.test.ts` (new) + existing `tests/integration/remove.test.ts` unchanged/passing
- [x] Full suite/build/lint green

**Dependencies:** Task 36, Task 40

**Files touched:**
- `src/core/registry.ts` (`hasSiblingSharingCacheDir`)
- `src/cli/remove.ts` (`RemoveResult` return type, purge fix + sibling-check)
- `src/cli/index.ts` (`runRemove` surfaces the purge outcome message)
- `tests/integration/remove-marketplace.test.ts` (new)

**Estimated scope:** Medium

---

## Task 47: `maui update` — dedupe by `sourceRepo` ✅ done

**Description:** `updatePlugin(name)` (`src/cli/update.ts`) is unchanged in
shape, now using an injectable `fetchImpl` (defaults to the real
`fetchSource`) purely for test observability. New `updateAll(options)`
handles the bare `maui update` case: groups registry entries by
`resolvePluginCacheDir(entry, home)` (Task 36) and calls `fetchImpl` once
per distinct cache dir, not once per plugin name, then reports every
plugin name as `refreshed` regardless of which specific call triggered the
shared refresh. `runUpdate` in `src/cli/index.ts` now calls `updatePlugin`
(named) or `updateAll` (bare) instead of looping registry keys itself.

**Acceptance criteria:**
- [x] `maui update <name>` on a marketplace-shared plugin refreshes the one shared clone; a sibling plugin's symlinks still resolve with no relink step (existing guarantee, now proven across siblings)
- [x] `maui update` (bare) with 2 plugins sharing one `sourceRepo` triggers exactly one fetch/copy operation, reported against both plugin names
- [x] `maui update` (bare) with 2 unrelated single-plugin sources still triggers 2 separate operations (regression)

**What actually happened — counting the dedup black-box:** proving "exactly
one fetch call" without instrumentation is hard for a copy-based fetch
(re-copying identical content is indistinguishable from copying it once).
Rather than introduce module-mocking (`bun:test`'s `mock.module`, unused
anywhere else in this codebase) added a minimal, explicit `fetchImpl?`
injection point on `UpdateOptions` — the same "inject a callback for test
observability" shape already used by `InstallOptions.confirm`/
`RemoveOptions.confirmPurge` — so tests can wrap the real `fetchSource` in
a counting closure without new test infrastructure.

**Verification:**
- [x] `bun test tests/integration/update-marketplace.test.ts` (new) + existing `tests/integration/update.test.ts` unchanged/passing
- [x] Full suite/build/lint green

**Dependencies:** Task 38, Task 40

**Files touched:**
- `src/cli/update.ts` (`updateAll`, `fetchImpl` injection, shared `computeHints` helper)
- `src/cli/index.ts` (`runUpdate` delegates to `updatePlugin`/`updateAll`, no longer loops `readRegistry()` itself)
- `tests/integration/update-marketplace.test.ts` (new)

**Estimated scope:** Medium

---

## Task 46: Codex marketplace-mode wiring ✅ done

**Description:** Task 45 confirmed a per-plugin flag exists, so this
implements the normal per-selection path (Task 41's shape), **not**
`installsWholeMarketplace`. `codex-marketplace`'s singular `--plugin` flag
selects one plugin by direct repository path (`<repo>/<pluginPath>`), not
by a name argument — a different mechanism from Claude's `<name>@<marketplace>`
qualifier, so this needed a new `pluginPath` field threaded through
`NativeMarketplaceIdentity` (populated from `installOnePlugin`'s existing
`pluginPath` param via `resolveNativeIdentity`) rather than reusing
Claude's/Grok's `sourceMode` branch alone.

**Acceptance criteria:**
- [x] Behavior matches Task 45's confirmed per-plugin direct-path shape, with a code comment citing codex-marketplace.com/docs
- [x] Marketplace-mode install builds `<owner>/<repo>/<pluginPath> --plugin --global`, once per selected plugin
- [x] Single-plugin source unaffected (regression) — repo root already is the "direct path" to the one plugin, so no branching was needed there
- [x] `remove()` unaffected by `sourceMode`/`pluginPath` either way, confirmed unchanged by Task 45's research

**Verification:**
- [x] `bun test tests/integration/codex-marketplace.test.ts` (new)
- [x] Full suite/build/lint green

**Dependencies:** Task 42, Task 45

**Files touched:**
- `src/types.ts` (`pluginPath?` on `NativeMarketplaceIdentity`)
- `src/cli/install.ts` (`resolveNativeIdentity` accepts and forwards `pluginPath`)
- `src/adapters/codex.ts` (`install()` appends `identity.pluginPath` to the repo path when present)
- `tests/integration/codex-marketplace.test.ts` (new)

**Estimated scope:** Medium

---

## Task 45: Codex research — confirm or deny a per-plugin selection flag (Open Question #9) ✅ done

**Description:** Pure research, no code. Check codex-marketplace.com/docs
and `npx codex-marketplace --help`/`add --help` for a documented way to
install one named plugin out of a multi-plugin repo, as opposed to the
whole-repo `--plugins` flag already documented. Update SPEC.md's Open
Question #9 and the Codex bullet in "Per-adapter marketplace behavior" with
whatever is actually confirmed — including explicitly recording "still
unconfirmed" if that's the honest outcome, per this project's standing
research-before-implementing discipline (Tasks 29–35).

**Acceptance criteria:**
- [x] Open Question #9 in SPEC.md updated to either a confirmed flag shape or an explicit "unconfirmed, adopting the safe default" decision — never left as a bare question
- [x] No code changes in this task

**What actually happened — plan's assumption overturned:** confirmed (fetched
codex-marketplace.com/docs twice via WebFetch, consistent both times, plus
corroborated via WebSearch hitting the same primary source) that Codex
**does** support genuine per-plugin selection, contrary to the plan's "most
likely no per-plugin flag exists" assumption. The mechanism differs from
Claude's `<name>@<marketplace>` qualifier: `codex-marketplace`'s singular
`--plugin` flag takes a **direct repository path to the one plugin**
(`add <owner>/<repo>/plugins/<plugin-name> --plugin`), not a name argument
alongside the repo. This means Task 46 implements normal per-plugin wiring
(Claude/Grok's shape), **not** `installsWholeMarketplace` (Gemini's shape) —
a real correction to the plan, caught by doing the research before writing
adapter code, exactly the point of scoping this as its own task.

**Verification:**
- [x] Manual diff review of SPEC.md — Open Question #9 marked *Resolved*, Codex bullet in "Native-marketplace adapters" rewritten with the confirmed command shape

**Dependencies:** None

**Files touched:**
- `SPEC.md`

**Estimated scope:** Small

---

## Task 44: Grok marketplace-mode branching ✅ done

**Description:** Add `sourceMode?: "single" | "marketplace"` to
`NativeAdapterRuntimeOptions` (`src/types.ts`), threaded from
`installMarketplace`/`installPlugin` into every adapter call (single mode
omits it or sets `"single"`, preserving today's behavior for existing
callers). `grokAdapter.install()` branches: `sourceMode !== "marketplace"` →
unchanged direct-git path (`grok plugin install git+<url> --trust`);
`sourceMode === "marketplace"` → `grok plugin marketplace add <url>` once +
`grok plugin install <name>@<marketplace>` once per selected plugin,
matching Claude Code's shape. `remove()` mirrors the same branch.

**Acceptance criteria:**
- [x] Single-plugin source still produces the exact same `git+<url> --trust` command as today (regression)
- [x] Marketplace-mode source with N selections produces `marketplace add` + `install <name>@<marketplace>` calls per selection (same "no dedup for Grok, like Claude" shape confirmed in Task 41 — not a single deduped `marketplace add`, since Grok isn't an `installsWholeMarketplace` adapter)
- [x] Existing `tests/integration/grok.test.ts` passes unmodified

**Verification:**
- [x] `bun test tests/integration/grok.test.ts tests/integration/grok-marketplace.test.ts` (new)
- [x] Full suite/build/lint green

**Dependencies:** Task 40

**Files touched:**
- `src/types.ts` (`sourceMode` on `NativeAdapterRuntimeOptions`)
- `src/adapters/grok.ts` (branches `install()`/`remove()` on `options?.sourceMode`)
- `src/cli/install.ts` (threads `sourceMode: pluginPath ? "marketplace" : "single"` into `adapter.install()`)
- `src/cli/remove.ts` (threads `sourceMode` from `entry.pluginPath` into `adapter.remove()`)
- `tests/integration/grok-marketplace.test.ts` (new)

**Estimated scope:** Medium

---

## Task 43: Gemini marketplace-mode ✅ done

**Description:** Set `installsWholeMarketplace: true` on `geminiAdapter`.
Verify end-to-end with the real adapter (fake `gemini` on fixture `$PATH`)
that a marketplace-mode install with N selections calls `gemini extensions
install <repo>` exactly once, and every selected plugin's registry entry
records `gemini` as installed via that one call.

**Acceptance criteria:**
- [x] N-selection install fires `gemini extensions install` exactly once
- [x] Removing all-but-one selected plugin never calls `gemini extensions uninstall`; removing the last one does

**What actually happened — a real bug found beyond the plan's scope:**
`geminiAdapter.remove()` calls `gemini extensions uninstall identity.pluginName`. Setting
`installsWholeMarketplace: true` alone wasn't sufficient — `identity.pluginName`
defaulted to each plugin's own `manifest.name` (e.g. "plugin-one"), but Gemini
installed the extension under the *marketplace's* name (e.g. "my-toolkit").
Uninstalling would have targeted a nonexistent extension. Fixed by extending
`resolveNativeIdentity` (`src/cli/install.ts`) to accept an optional
`wholeMarketplaceName` fallback, computed at the call site as
`basename(sourceRepo)` whenever `adapter.installsWholeMarketplace` is set and
the plugin came from a marketplace source (`pluginPath` defined) — an explicit
`target.plugin` override still wins. Caught by writing the removal test before
the fix, per this project's TDD discipline.

**Verification:**
- [x] `bun test tests/integration/gemini-marketplace.test.ts` (new) — first run reproduced both the "should install once" and "should uninstall by marketplace name" failures before the fix
- [x] Full suite/build/lint green

**Dependencies:** Task 42

**Files touched:**
- `src/adapters/gemini.ts` (`installsWholeMarketplace: true`)
- `src/cli/install.ts` (`resolveNativeIdentity`'s `wholeMarketplaceName` fallback)
- `tests/integration/gemini-marketplace.test.ts` (new)
- `SPEC.md` (documented the pluginName-resolution fix under the Gemini bullet)

**Estimated scope:** Small

---

## Task 42: `installsWholeMarketplace` dedup mechanism (install + remove) ✅ done

**Description:** Add `installsWholeMarketplace?: boolean` to
`NativeMarketplaceAdapter` (`src/types.ts`). In `installMarketplace`'s
per-selection loop, track already-invoked agent IDs for adapters with the
flag set within one install run; skip the actual `.install()` call on
repeats but still record each selected plugin's own registry `agents` entry
(so `list` shows it as installed). In `removePlugin`, before calling
`adapter.remove()` for an agent entry whose adapter has the flag, scan
`registry.plugins` for any *other* entry sharing the same `sourceRepo` that
still has an agent entry for that same agent ID — if found, skip the native
`.remove()` call entirely (just drop this plugin's own registry
association), only calling it when this is the last sibling.

**Acceptance criteria:**
- [x] A fake `installsWholeMarketplace` test-double adapter invoked with 3 selections calls `.install()` exactly once (verified at the pure-function level: `shouldSkipNativeInstall` returns false once then true for the same dedupe key)
- [x] Removing one of those 3 plugins (siblings still registered) does not call `.remove()`; removing the last of the 3 does (`shouldSkipNativeRemove`)
- [x] Non-flagged adapters (Claude Code, Grok in marketplace mode) are completely unaffected — Task 41's existing test + full suite regression confirms this

**Verification:**
- [x] `bun test tests/unit/native-dedup.test.ts` (new, using literal fake adapter objects, not real ones or the adapter registry)
- [x] Full suite/build/lint green

**Dependencies:** Task 40

**Files touched:**
- `src/types.ts` (`installsWholeMarketplace?` on `NativeMarketplaceAdapter`)
- `src/core/native-dedup.ts` (new — `shouldSkipNativeInstall`/`shouldSkipNativeRemove` as pure, independently-testable functions, rather than baking the logic directly into `install.ts`/`remove.ts` — lets the dedup decision be tested with a literal fake adapter with no dependency on the real adapter registry)
- `src/cli/install.ts` (`installOnePlugin` takes a shared `Set` threaded through `installFetchedMarketplace`'s loop)
- `src/cli/remove.ts` (`removePlugin`'s native branch consults `shouldSkipNativeRemove` before calling `adapter.remove()`)
- `tests/unit/native-dedup.test.ts` (new)

**Estimated scope:** Medium

---

## Task 41: Claude Code marketplace-mode loop ✅ done

**Description:** No new mechanism — prove `installOnePlugin`'s existing
native-marketplace branch (unchanged since Task 18b) correctly handles being
called once per selected plugin, each with its own manifest's
`resolveNativeIdentity()`, all sharing one `claude plugin marketplace add
<repo>` call (since `identity.repo` resolves from the shared `source`, same
for every sibling) followed by one `claude plugin install
<name>@<marketplace>` per selection.

**Acceptance criteria:**
- [x] A 3-plugin marketplace fixture, selecting 2 of 3, produces exactly two `plugin install <name>@<marketplace>` lines (fake `claude` on fixture `$PATH`) — **revised from the plan's "exactly one `plugin marketplace add` line":** each selected plugin's `installOnePlugin` call runs Claude's `install()` independently, which bundles `marketplace add` + `plugin install` together (see `claude-code.ts`) — there's no partial-dedup hook that splits "register the marketplace" from "install a plugin from it" into separate steps. So 2 selections produce 2 `marketplace add` lines, not 1. This is harmless (Claude's own `add` is idempotent for an already-known marketplace) and correctness is unaffected — no dedup mechanism was needed for Claude, unlike Gemini/Codex (Task 42), because Claude's `uninstall` is genuinely per-plugin with no shared removable state across siblings.
- [x] Each selected plugin gets its own registry entry with a distinct `identity.pluginName` but identical `identity.marketplaceName`/`repo`

**Verification:**
- [x] `bun test tests/integration/claude-code-marketplace.test.ts` (new)

**Dependencies:** Task 40

**Files touched:**
- `tests/integration/claude-code-marketplace.test.ts` (new)
- No `src/adapters/claude-code.ts` change — confirmed regression-proving, passed with zero adapter code changes

**Estimated scope:** Small

---

## Task 40: `installOnePlugin` extraction + `installMarketplace`/`installFromSource` + CLI wiring ✅ done

**Description:** Extract `installPlugin`'s per-plugin core (the
target-dispatch loop + registry-entry write, currently inline) into a shared
internal function, e.g. `installOnePlugin(pluginDir, manifest, source,
sourceRepo, pluginPath, options)`, called once by unchanged `installPlugin`
(single mode, `sourceRepo = pluginDir`, no `pluginPath`) and once per
selection by new `installMarketplace(source, options)` (marketplace mode:
fetch once via `fetchSource`, run Task 39's selection against the catalog,
then call `installOnePlugin` once per selected plugin with `pluginDir =
join(cacheDir, pluginPath)`, `sourceRepo = cacheDir`). Add top-level
`installFromSource(source, options): Promise<InstallResult[]>` that runs
`detectSourceMode` and dispatches to one or the other, always returning an
array (length 1 for single mode). Wire `--plugin`/`--all-plugins` into
`parseInstallArgs` in `src/cli/index.ts`, and switch `runInstall` to call
`installFromSource`, printing one summary block per result. **Scope this
task to symlink targets only** (`_default` + one real symlink adapter, e.g.
Kiro) for its own test fixtures — native-marketplace targets in a
marketplace-mode manifest flow through the same shared loop but are proven
starting Task 41.

**Acceptance criteria:**
- [x] `installPlugin(source, options)` (existing signature) is behaviorally and type-identical to today for every existing caller — all existing test files pass unmodified
- [x] `installMarketplace()` against a 2-plugin symlink-only fixture (`_default` + Kiro) produces 2 registry entries sharing one `sourceRepo`, each with correct `pluginPath` and correct `symlinks`
- [x] `maui install <marketplace-fixture> --all-plugins` (CLI) installs both and prints both summaries; `--plugin a` installs only `a`
- [x] `maui install <marketplace-fixture>` with no flags and no TTY (the real test-runner environment) exits non-zero with the plugin-name list from Task 39's error

**Verification:**
- [x] New `tests/integration/install-marketplace-skeleton.test.ts` covering the above
- [x] Full existing suite green (`bun test`, `bun run build`, `bun run lint`)

**Dependencies:** Task 36, Task 38, Task 39

**Files touched:**
- `src/cli/install.ts` (`installOnePlugin` extraction; `installPlugin`/`installMarketplace`/`installFromSource`)
- `src/cli/index.ts` (`--plugin`/`--all-plugins` parsing, `runInstall` now calls `installFromSource`)
- `src/core/errors.ts` (`MarketplaceModeMismatchError`)
- `tests/integration/install-marketplace-skeleton.test.ts` (new)

**Estimated scope:** Large

---

## Task 39: Plugin selection — interactive prompt + `--plugin`/`--all-plugins` + hard error ✅ done

**Description:** New function, e.g. `selectPlugins(catalog, options)` in
`src/core/plugin-selection.ts`, taking the marketplace `catalog` from Task
38 plus `{ pluginFlags?: string[], allPlugins?: boolean, isTTY?: boolean,
prompt?: (question) => Promise<string> }` (both `isTTY`/`prompt` injectable
for testability, mirroring the existing `confirm`-injection pattern in
`remove.ts`/`codex.ts`). Behavior: `--plugin`/`--all-plugins` always
short-circuit the prompt (interactive or not); with neither and a TTY,
print a numbered `name — description` list and parse a comma-separated
answer or `all`; with neither and no TTY, throw a new
`PluginSelectionRequiredError` listing the catalog's plugin names (matching
the project's "explicit error types over generic Error" style from
`core/errors.ts`).

**Acceptance criteria:**
- [x] `--plugin a --plugin b` selects exactly `["a", "b"]`, no prompt invoked, regardless of `isTTY`
- [x] `--all-plugins` selects every catalog entry, no prompt invoked
- [x] No flags + `isTTY: true` + injected prompt returning `"1,3"` selects the 1st and 3rd catalog entries; `"all"` selects everything
- [x] No flags + `isTTY: false` throws `PluginSelectionRequiredError` whose message lists every catalog plugin name
- [x] Invalid numeric input (out of range, non-numeric) in interactive mode errors clearly via `InvalidPluginSelectionError`, doesn't silently install nothing

**Verification:**
- [x] `bun test tests/unit/plugin-selection.test.ts`

**Dependencies:** None

**Files touched:**
- `src/core/plugin-selection.ts` (new — `PluginSelectionRequiredError`/`InvalidPluginSelectionError` live here, not `core/errors.ts`, to keep selection-specific errors colocated with the selection logic)
- `tests/unit/plugin-selection.test.ts` (new)
- `src/core/source-mode.ts` (unrelated `tsc --noEmit` fix caught while running lint for this task — `noUncheckedIndexedAccess` flagged `match[1]`)

**Estimated scope:** Medium

---

## Task 38: `fetchSource()` — cache-key rewrite consuming Task 37 ✅ done

**Description:** Replace `fetchPlugin`'s hardcoded `manifest.name` cache key
with mode-aware logic: clone/copy source into staging (unchanged), call
`detectSourceMode(staging)`, then compute the target cache dir as
`join(pluginsRoot(home), manifest.name)` for single mode (byte-identical to
today) or `join(pluginsRoot(home), marketplaceName)` for marketplace mode.
Export as `fetchSource(source, home): Promise<FetchedSource>` where
`FetchedSource` carries `{ cacheDir, mode, ...(mode === "marketplace" ? {
marketplaceName, catalog } : {}) }`. Keep `fetchPlugin` as a thin
single-mode-only wrapper around `fetchSource` so existing call sites
(`install.ts`, `update.ts`) don't need to change in this task — they're
migrated in Tasks 40/47.

**Acceptance criteria:**
- [x] Single-plugin fixture: `fetchSource` produces the same `cacheDir` path and contents as today's `fetchPlugin`
- [x] Marketplace fixture (root `marketplace.json` + `plugins/a/maui.json` + `plugins/b/maui.json`): `fetchSource` copies the whole repo once into `~/.maui/plugins/<marketplace-name>/`, and `FetchedSource.catalog` lists both `a` and `b` with correct `pluginPath`
- [x] Re-fetching the same marketplace source wipes and recopies the one shared dir (idempotent, matching today's single-plugin guarantee)
- [x] `fetchPlugin(source, home)` (existing signature) still passes every existing caller's test unchanged

**Verification:**
- [x] `bun test tests/integration/fetch.test.ts` (extended, actual location — not `tests/unit/`) and full suite regression

**Dependencies:** Task 37

**Files touched:**
- `src/core/fetch.ts`
- `tests/integration/fetch.test.ts`

**Estimated scope:** Medium

---

## Task 37: `detectSourceMode()` — single-plugin vs. marketplace detection primitive ✅ done

**Description:** New pure function (`src/core/source-mode.ts`), given an
already-fetched root directory, returns a discriminated union: `{ mode:
"single" }` when `<root>/maui.json` exists (checked **first**, full
stop — do not consult `marketplace.json` at all in this case, since that's
what keeps every existing single-plugin fixture/test unchanged); else, if
`<root>/.claude-plugin/marketplace.json` exists, parse its `plugins` array
and return `{ mode: "marketplace", marketplaceName, catalog: [{ name,
source, description? }] }` for entries whose `source` matches
`./plugins/<name>` (strip the `./` prefix, store as `pluginPath`); else
`{ mode: "none" }` (today's existing "no manifest" failure path —
`readManifest` throwing `ManifestValidationError` — unchanged, not newly
built here). Also fix SPEC.md's "Detecting single-plugin vs. marketplace
mode" section, whose current wording reads as if `marketplace.json`'s shape
is checked before/independent of `maui.json`'s presence — correct it to
state the maui.json-first algorithm explicitly, since that's what's
actually backward-compatible with every existing single-plugin fixture.

**Acceptance criteria:**
- [x] Root `maui.json` present → `{ mode: "single" }`, regardless of whether a `marketplace.json` also exists (covers the self-hosted single-plugin marketplace scaffold shape)
- [x] No `maui.json`, root `marketplace.json` with ≥1 `./plugins/<name>` entries → `{ mode: "marketplace", ... }` with correct `catalog`
- [x] No `maui.json`, no `marketplace.json` (or one with no `./plugins/` entries) → `{ mode: "none" }`
- [x] Malformed `marketplace.json` (not JSON, missing `plugins` array) throws a typed error, not a generic crash
- [x] SPEC.md's "Detecting single-plugin vs. marketplace mode" section wording matches this maui.json-first algorithm

**Verification:**
- [x] `bun test tests/unit/source-mode.test.ts` — pure fixture-directory tests, no network/git

**Dependencies:** None

**Files touched:**
- `src/core/source-mode.ts` (new)
- `tests/unit/source-mode.test.ts` (new)
- `SPEC.md`

**Estimated scope:** Small

---

## Task 36: Registry schema — `sourceRepo` + `pluginPath`, backward-compat fallback ✅ done

**Description:** Add `sourceRepo?: string` and `pluginPath?: string` to
`RegistryPluginEntry` in `src/types.ts`. `sourceRepo` is the absolute path
of the shared cache directory (`~/.maui/plugins/<cache-key>/`) and is
populated for **every** entry going forward, single-plugin included (cache
key equals `manifest.name` in that case, so it's just today's
`join(pluginsRoot(home), manifest.name)` made explicit). `pluginPath` is the
plugin's relative subpath within that cache dir (`plugins/<name>`) and is
only set for marketplace-mode entries. Add a small helper,
`resolvePluginCacheDir(entry, home)`, used by every later task (`update`,
`remove`, dedup logic) instead of re-deriving the path inline — falls back
to `join(pluginsRoot(home), entry.name)` when `entry.sourceRepo` is absent
(pre-migration registries).

**Acceptance criteria:**
- [x] `RegistryPluginEntry` gains both optional fields; existing registry JSON files (no such fields) still parse and round-trip without error
- [x] `resolvePluginCacheDir()` returns the correct absolute path for both a fixture entry with `sourceRepo` set and one without (simulating a pre-migration entry)
- [x] No existing registry round-trip test breaks

**Verification:**
- [x] `bun test tests/unit/registry.test.ts`
- [x] New unit test: a hand-written pre-migration-shaped registry JSON (no `sourceRepo`/`pluginPath`) still round-trips through `readRegistry`/`writeRegistry`

**Dependencies:** None

**Files touched:**
- `src/types.ts`
- `src/core/registry.ts`
- `tests/unit/registry.test.ts`

**Estimated scope:** Small

---

## Task 35: Corroborate Grok's install/uninstall shape with a second source ✅ done

**Description:** Task 31 adopted `grok plugin install git+<url> --trust` /
`grok plugin uninstall <name>` as "the most specific information available,"
explicitly flagged as not confirmed by docs.x.ai/build/cli/reference's own
argument syntax (that page only names subcommands). A second, independent
CLI/plugin-management reference surfaced afterward, describing the identical
install/uninstall shape (same `git+<url> --trust` form, same plain-name
uninstall, plus the git/npm/local-sideload "outside the marketplace" install
paths). No code behavior changed — the existing implementation already
matched — but the confirmation-status wording in `grok.ts`'s comment and
SPEC.md (Native-marketplace adapters section and Open Question #2c) was
overstating uncertainty relative to current evidence.

**Acceptance criteria:**
- [x] `grok.ts`'s doc comment reflects corroboration from a second source, still honestly short of live-CLI verification
- [x] SPEC.md's Native-marketplace adapters section and Open Question #2c updated to match, without overclaiming a docs.x.ai-primary-source confirmation that still doesn't exist
- [x] No behavior change — `install()`/`remove()` bodies untouched

**What actually happened:** compared the newly-surfaced reference against
the shipped `grokAdapter.install`/`remove` implementation line by line — both
matched exactly (git+url + `--trust`, plain-name uninstall). Updated the
`grok.ts` comment and SPEC.md's two Grok call-outs to say "corroborated by a
second, independent reference," not "confirmed by docs.x.ai," preserving the
project's standing discipline of not overstating source provenance. Left the
one still-genuinely-open item (whether Grok's skill loader reads
`.agents/skills/`) untouched — the new source didn't address it either.

**Verification:**
- [x] `bun test` — no test changes needed, no behavior changed
- [x] Manual diff review of `grok.ts` and `SPEC.md` for wording accuracy

**Dependencies:** Task 31

**Files touched:**
- `src/adapters/grok.ts`
- `SPEC.md`

**Estimated scope:** Small

---

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

## Task 31: Confirm Grok CLI argument shapes ✅ done

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
- [x] Research contradicted the current by-analogy shape: `grok.ts` and its test are corrected (TDD — failing test first)
- [x] SPEC.md's Open Question #2c rewritten as "partially resolved," honestly: the new shape is better-informed, not docs.x.ai-primary-source-confirmed — the `.agents/skills/` sub-question stayed genuinely unanswered, no source addressed it

**What actually happened:** the official docs.x.ai/build/cli/reference page
itself never confirmed or denied the by-analogy Claude Code shape — it only
lists subcommand names and defers to `--help`, which isn't runnable without
a real `grok` CLI. More specific CLI usage notes surfaced during this
session (not independently re-confirmed against docs.x.ai) describe a
*different* install path entirely for maui's exact use case (a plain git
repo, not a marketplace-catalog entry): `grok plugin install
git+https://github.com/<owner>/<repo> --trust`, with removal by plain name
(`grok plugin uninstall <plugin-name>`, no `@<marketplace>` qualifier at
all). Adopted this since it's the most specific information available and
directly matches maui's plugin model, but flagged in both the code comment
and SPEC.md that it's not confirmed by the primary reference page itself —
smoke-test against a real `grok` CLI before production use.

**Verification:**
- [x] `bun test` on `tests/integration/grok.test.ts` passes (TDD: failing then passing)
- [x] `bun run build && bun run lint` clean

**Dependencies:** None

**Files touched:**
- `SPEC.md`
- `src/adapters/grok.ts`
- `tests/integration/grok.test.ts`

**Estimated scope:** Medium — the argument shape changed, a live behavior change

---

## Task 32: Decide GitHub Copilot / Antigravity adapter scope ✅ done

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
- [x] SPEC.md's Open Question #1 (the GitHub Copilot/Antigravity portion) rewritten as an explicit decision with rationale, not left open
- [x] A scriptable CLI *was* found for both tools: did NOT implement either adapter in this task — flagged as future-phase candidates in `tasks/plan.md` instead

**What actually happened:** the recommended default in this task's own
description ("no dedicated adapter for v1") turned out to be wrong — both
tools have real, non-interactive plugin CLIs. **GitHub Copilot CLI** is
solidly confirmed via GitHub's own official docs: a marketplace model
almost identical to Claude Code's (`copilot plugin marketplace add
<owner>/<repo>`, `copilot plugin install <name>@<marketplace>`, `copilot
plugin uninstall <name>`). **Antigravity** has confirmed `agy plugin
install|uninstall|list|enable|disable` subcommands (multiple third-party
references; Google's own docs page is JS-rendered and wasn't fetchable as
static content), but exact argument syntax (git URL support, marketplace
concept) isn't confirmed yet. Per this task's own guardrail, stopped short
of implementing either — recorded both as candidates for a future phase in
`tasks/plan.md`'s new "Future Phase Candidates" section, not scoped as full
tasks here.

**Verification:**
- [x] SPEC.md reads internally consistent
- [x] No code changes made (as expected — pure research + decision)

**Dependencies:** None

**Files touched:**
- `SPEC.md`
- `tasks/plan.md` (Future Phase Candidates note)

**Estimated scope:** Small

---

## Task 33: Fill in remaining contextFile conventions ✅ done

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
- [x] Each **confirmed** convention gets an entry in `CONTEXT_FILES` (same shape as existing entries), a matching row in SPEC.md's contextFile table, and a unit test in `tests/unit/context-file.test.ts`
- [x] Anything that stays unconfirmed after real research stays on the `AGENTS.md` fallback — no guessed filenames — but SPEC.md's wording changes to reflect that it was actually checked this time, not just "unconfirmed"

**What actually happened:** confirmed conventions for four of the five
remaining agents, plus Gemini's still-open project-scope path from Task 30:
- **Codex** (learn.chatgpt.com/docs/codex/cli): project-root `AGENTS.md`
  confirmed (`/init` scaffolds one); no global path documented.
- **Cursor** (cursor.com/docs/context/rules): project-root `AGENTS.md`
  confirmed as "a plain markdown alternative to `.cursor/rules`"; global
  confirmed to **not exist** at all (User Rules are UI/database-managed).
- **Windsurf** (docs.devin.ai/desktop/cascade/memories): global
  `~/.codeium/windsurf/memories/global_rules.md` confirmed — a real,
  distinct path; no current single-file project convention (`.windsurfrules`
  is documented as legacy), stays on the fallback.
- **Kiro** (kiro.dev/docs/steering/): both confirmed —
  `~/.kiro/steering/AGENTS.md` globally (a real, distinct path) and
  project-root `AGENTS.md`. Unlike Cursor/Windsurf, this one is actually
  reachable in practice since `kiroAdapter` has a real `globalRoot`.
- **Gemini project-scope** (from Task 30): confirmed indirectly —
  geminicli.com/docs/cli/gemini-md/ documents a workspace-and-parent-
  directories search rather than one fixed path, but a project root is
  unambiguously in scope.
- **Grok**: re-checked docs.x.ai/build/cli/reference — documents a `grok
  memory clear` subcommand but no filename/path convention. Stays
  genuinely unconfirmed; this is the one open item left in the whole phase,
  honestly labeled as such rather than force-resolved.

Also cleaned up two unrelated stale "TBD" references found while doing the
phase-wide checkpoint grep (the Tech Stack section's CLI-framework line,
and the Project Structure listing's Grok comment) so the checkpoint's
"no dangling TBD" bar is met precisely, not just approximately.

**Verification:**
- [x] `bun test tests/unit/context-file.test.ts` passes with new cases (RED confirmed first for windsurf/kiro global — the two genuinely new distinct values)
- [x] Full `bun test` suite green — 137 tests (+6 from this task)
- [x] `bun run build && bun run lint` clean

**Dependencies:** None

**Files touched:**
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
