import { resolveBinary, runNativeCommand } from "../core/marketplace-exec";
import type { NativeMarketplaceAdapter } from "../types";

/**
 * Non-interactive `claude` CLI subcommands (not the interactive /plugin
 * slash commands, since maui runs outside a Claude Code session) —
 * confirmed at code.claude.com/docs/en/discover-plugins.
 */
export const claudeCodeAdapter: NativeMarketplaceAdapter = {
  id: "claude-code",
  kind: "native-marketplace",

  async detect() {
    return resolveBinary("claude") !== null;
  },

  async install(identity) {
    await runNativeCommand("claude", ["plugin", "marketplace", "add", identity.repo]);
    await runNativeCommand("claude", [
      "plugin",
      "install",
      `${identity.pluginName}@${identity.marketplaceName}`,
    ]);
  },

  async remove(identity) {
    await runNativeCommand("claude", [
      "plugin",
      "uninstall",
      `${identity.pluginName}@${identity.marketplaceName}`,
    ]);
  },
};
