---
name: creating-grok-plugin
description: Create a Grok CLI plugin or marketplace source — skills/hooks folder discovery, marketplace registration in config.toml, and grok plugin install/uninstall commands. Use when building or packaging a Grok CLI plugin, or installing one from a git repo or marketplace.
---

# Creating a Grok CLI plugin or marketplace source

Grok CLI plugins are simpler than Claude Code's or Codex's: there's **no
confirmed dedicated plugin manifest file** (no `grok-plugin.json` or
equivalent documented). A plugin is just a directory with `skills/` and/or
`hooks/` subfolders that Grok discovers by convention. Exact CLI argument
syntax is thinly documented — the primary reference page names the
subcommands that exist but defers to `grok <subcommand> --help` for
arguments, so treat anything below marked "unconfirmed" as a strong
starting point, not a guarantee, and verify against a real `grok` install
before scripting it into CI.

Official reference:
[docs.x.ai/build/cli/reference](https://docs.x.ai/build/cli/reference) and
[docs.x.ai/build/features/skills-plugins-marketplaces](https://docs.x.ai/build/features/skills-plugins-marketplaces).

## Directory layout

```
my-plugin/
├── skills/
│   └── my-skill/
│       └── SKILL.md
└── hooks/
    └── my-hook.json          # exact hook-file naming/schema not fully documented — confirm with `grok hooks --help`
```

No `.grok-plugin/` metadata folder, no manifest — just the source folders
themselves.

## How Grok discovers plugins and skills

Grok scans several locations, in addition to whatever a plugin installs
into:

- **Skills**: `./.grok/skills/` (project), `~/.grok/skills/` (global), a
  plugin's own `skills/` directory, plus any extra paths configured in
  `config.toml`.
- **Hooks**: `~/.grok/hooks/` (global), `./.grok/hooks/` (project), and a
  plugin's own `hooks/` directory.
- **Plugins themselves**: `./.grok/plugins/` (project), `~/.grok/plugins/`
  (global), marketplace-installed plugins, and any path passed via
  `--plugin-dir <PATH>`.

Whether Grok's skill loader also reads the shared `.agents/skills/`
convention some other tools follow is **not confirmed** — don't assume it
does.

## Marketplaces

Marketplace sources are tracked in `~/.grok/config.toml` under
`[[marketplace.sources]]`, plus a
`~/.grok/plugins/known_marketplaces.json` index. A marketplace source is
typically a git repo; Grok crawls it for installable plugins rather than
reading a repo-specific catalog file schema of its own (no confirmed
`marketplace.json` equivalent — treat any catalog metadata as internal to
Grok's own config, not something you author by hand in the plugin repo).

## Installing a plugin directly from git (no marketplace)

For a plugin that's just a git repo (not registered as a marketplace
source), Grok documents installing "outside the marketplace":

```bash
grok plugin install git+https://github.com/<owner>/<repo> --trust
```

`--trust` is required for any non-marketplace source. No
`<name>@<marketplace>` qualifier — the plugin is identified afterward by
its plain name:

```bash
grok plugin uninstall <plugin-name>
```

## Installing via a marketplace

```bash
grok plugin marketplace add https://github.com/<owner>/<repo>
grok plugin install <plugin-name>@<marketplace-name>

# remove
grok plugin uninstall <plugin-name>@<marketplace-name>
```

## Other confirmed subcommands

```bash
grok plugin list
grok plugin update <plugin-name>
grok plugin enable <plugin-name>
grok plugin disable <plugin-name>
grok plugin details <plugin-name>
grok plugin validate <plugin-name>

grok plugin marketplace list
grok plugin marketplace remove <marketplace-name>
grok plugin marketplace update <marketplace-name>
```

These subcommand *names* are confirmed to exist; run `grok <subcommand>
--help` for the exact flags each one accepts before relying on them in a
script.

## Interactive TUI

Inside a `grok` session, `/plugins`, `/hooks`, `/skills`, and `/mcps` open
interactive management panels — useful for manual install/inspect, not
needed for scripted distribution.

## Publishing checklist

1. Create `skills/<name>/SKILL.md` (and/or `hooks/`) at your repo root —
   no manifest file needed.
2. Push to a git repo.
3. For a single plugin: tell users to run
   `grok plugin install git+https://github.com/<owner>/<repo> --trust`.
4. For a marketplace of several plugins: register the repo with
   `grok plugin marketplace add <url>`, then have users
   `grok plugin install <plugin-name>@<marketplace-name>` for whichever
   plugin(s) they want.
5. Smoke-test both paths against a real `grok` CLI — this ecosystem's
   documentation is thinner than Claude Code's or Codex's, and argument
   syntax has been known to differ from the primary reference page.

For anything not covered here — MCP server bundling, `config.toml` schema
details — see
[docs.x.ai/build/features/skills-plugins-marketplaces](https://docs.x.ai/build/features/skills-plugins-marketplaces).
