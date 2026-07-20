import { resolveBinary, runNativeCommand } from "../core/marketplace-exec";
import type { NativeMarketplaceAdapter } from "../types";

/**
 * `gemini extensions install <github-url>` and
 * `gemini extensions uninstall <name>` are both confirmed real, non-
 * interactive terminal commands at
 * google-gemini.github.io/gemini-cli/docs/extensions/ (the uninstall verb
 * was not found during the original spec research, which only checked
 * geminicli.com/docs/reference/commands — a different, less complete page).
 */
export const geminiAdapter: NativeMarketplaceAdapter = {
  id: "gemini",
  kind: "native-marketplace",
  /**
   * `gemini extensions install <repo>` installs the entire repo as one
   * extension — there's no per-plugin granularity, so a marketplace-mode
   * source only ever needs one install call regardless of how many
   * plugins were selected (see core/native-dedup.ts).
   */
  installsWholeMarketplace: true,

  async detect() {
    return resolveBinary("gemini") !== null;
  },

  async install(identity) {
    await runNativeCommand("gemini", ["extensions", "install", identity.repo]);
  },

  async remove(identity) {
    await runNativeCommand("gemini", ["extensions", "uninstall", identity.pluginName]);
  },
};
