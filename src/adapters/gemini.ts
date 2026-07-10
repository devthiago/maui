import { resolveBinary, runNativeCommand } from "../core/marketplace-exec";
import { UnsupportedRemovalError } from "../core/errors";
import type { NativeMarketplaceAdapter } from "../types";

export { UnsupportedRemovalError };

/**
 * `gemini extensions install <github-url>` is confirmed at
 * geminicli.com/docs/extensions/. A non-interactive `uninstall` equivalent
 * is not: geminicli.com/docs/reference/commands lists "uninstall" only as
 * an interactive /extensions slash-command subcommand, with no confirmed
 * terminal syntax — so remove() reports unsupported rather than guessing.
 */
export const geminiAdapter: NativeMarketplaceAdapter = {
  id: "gemini",
  kind: "native-marketplace",

  async detect() {
    return resolveBinary("gemini") !== null;
  },

  async install(identity) {
    await runNativeCommand("gemini", ["extensions", "install", identity.repo]);
  },

  async remove(identity) {
    throw new UnsupportedRemovalError(
      identity.pluginName,
      'run "gemini extensions uninstall" inside an interactive gemini session, or check "gemini extensions --help" for the current non-interactive syntax.'
    );
  },
};
