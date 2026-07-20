import { resolveBinary, runNativeCommand } from "../core/marketplace-exec";
import type { NativeMarketplaceAdapter } from "../types";

/**
 * `grok plugin <list|install|uninstall|update|enable|disable|details|validate>`
 * and `grok plugin marketplace <list|add|remove|update>` are confirmed to
 * exist at docs.x.ai/build/cli/reference, but that page itself doesn't spell
 * out argument syntax — it directs readers to `grok <subcommand> --help`
 * for specifics. maui's plugins are git repos, not marketplace-catalog
 * entries, and Grok documents a direct path for exactly that case ("install
 * plugins outside the marketplace" via a `git+<url>` source), distinct from
 * the marketplace-add-then-install-by-name flow this adapter used
 * previously by analogy to Claude Code. `install`/`uninstall` need no
 * `<name>@<marketplace>` qualifier in this flow — a plugin installed
 * directly from git is later identified by its plain name. `--trust` is
 * required for any non-marketplace source. docs.x.ai/build/cli/reference
 * itself still stays silent on argument syntax, but a second, independent
 * CLI reference (a plugin-management writeup covering install/uninstall
 * and the git+url/npm/local-sideload "outside the marketplace" paths)
 * describes this exact shape — corroborating, not just by-analogy anymore,
 * though still not a live-CLI-verified fact. A wrong guess still fails
 * loudly with the real `grok` CLI's own error output (via
 * NativeInstallError), not silently — smoke-test against a real `grok`
 * CLI before relying on this in production.
 */
export const grokAdapter: NativeMarketplaceAdapter = {
  id: "grok",
  kind: "native-marketplace",

  async detect() {
    return resolveBinary("grok") !== null;
  },

  async install(identity) {
    await runNativeCommand("grok", [
      "plugin",
      "install",
      `git+https://github.com/${identity.repo}`,
      "--trust",
    ]);
  },

  async remove(identity) {
    await runNativeCommand("grok", ["plugin", "uninstall", identity.pluginName]);
  },
};
