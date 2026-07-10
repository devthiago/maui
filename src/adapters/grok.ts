import { resolveBinary, runNativeCommand } from "../core/marketplace-exec";
import type { NativeMarketplaceAdapter } from "../types";

/**
 * `grok plugin marketplace <list|add|remove|update>` and
 * `grok plugin <list|install|uninstall|...>` are confirmed to exist at
 * docs.x.ai/build/cli/reference, mirroring Claude Code's command shape
 * closely. Exact argument syntax (owner/repo vs. full URL for
 * `marketplace add`; whether `install`/`uninstall` need a
 * `<name>@<marketplace>` qualifier) was NOT confirmed by any docs page
 * checked — this follows Claude Code's confirmed shape by analogy. A
 * wrong guess fails loudly with the real `grok` CLI's own error output
 * (via NativeInstallError), not silently — smoke-test against a real
 * `grok` CLI before relying on this in production.
 */
export const grokAdapter: NativeMarketplaceAdapter = {
  id: "grok",
  kind: "native-marketplace",

  async detect() {
    return resolveBinary("grok") !== null;
  },

  async install(identity) {
    await runNativeCommand("grok", ["plugin", "marketplace", "add", identity.repo]);
    await runNativeCommand("grok", [
      "plugin",
      "install",
      `${identity.pluginName}@${identity.marketplaceName}`,
    ]);
  },

  async remove(identity) {
    await runNativeCommand("grok", [
      "plugin",
      "uninstall",
      `${identity.pluginName}@${identity.marketplaceName}`,
    ]);
  },
};
