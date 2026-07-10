import { resolveBinary, runNativeCommand } from "../core/marketplace-exec";
import { UnsupportedRemovalError } from "../core/errors";
import type { NativeMarketplaceAdapter } from "../types";

export class MissingPackageFieldError extends Error {
  constructor(pluginName: string) {
    super(
      `Plugin "${pluginName}" has no "package" field for the opencode target in maui.json — ` +
        'OpenCode installs plugins as npm packages (e.g. "@scope/name"), so this is required.'
    );
    this.name = "MissingPackageFieldError";
  }
}

/**
 * `opencode plugin <module> [--global]` is confirmed at opencode.ai/docs/cli/
 * ("Install a plugin and update your config"). No uninstall verb is
 * documented for the OpenCode CLI, so remove() reports unsupported rather
 * than guessing. <module> is an npm package specifier, not a git source —
 * OpenCode plugins must actually be published to npm for this to work.
 */
export const openCodeAdapter: NativeMarketplaceAdapter = {
  id: "opencode",
  kind: "native-marketplace",

  async detect() {
    return resolveBinary("opencode") !== null;
  },

  async install(identity) {
    if (!identity.package) {
      throw new MissingPackageFieldError(identity.pluginName);
    }
    await runNativeCommand("opencode", ["plugin", identity.package, "--global"]);
  },

  async remove(identity) {
    throw new UnsupportedRemovalError(
      identity.pluginName,
      'no "opencode plugin" uninstall command is documented — remove it manually by editing the "plugin" array in your opencode.json, or check "opencode plugin --help" for the current syntax.'
    );
  },
};
