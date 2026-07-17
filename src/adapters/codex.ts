import { homedir } from "node:os";
import { resolveBinary, runNativeCommand } from "../core/marketplace-exec";
import { hasConsented, recordConsent } from "../core/config";
import { confirm as confirmLine } from "../core/prompt";
import type { NativeAdapterRuntimeOptions, NativeMarketplaceAdapter } from "../types";

const CONSENT_KEY = "codex-marketplace";

async function ensureConsent(options: NativeAdapterRuntimeOptions): Promise<void> {
  const home = options.home ?? homedir();
  if (await hasConsented(CONSENT_KEY, home)) return;

  const confirm = options.confirm ?? confirmLine;
  const confirmed = await confirm(
    'maui uses the third-party "codex-marketplace" tool (npx codex-marketplace) to manage Codex CLI plugins — this is not an OpenAI-official CLI. Allow maui to invoke it?'
  );
  if (!confirmed) {
    throw new Error("Codex marketplace operations declined by user");
  }
  await recordConsent(CONSENT_KEY, home);
}

/**
 * Third-party codex-marketplace tool (npx codex-marketplace), not an
 * OpenAI-official CLI — see codex-marketplace.com/docs. Every install/
 * remove first confirms the user is fine with maui invoking it, once per
 * machine (tracked in ~/.maui/config.json), since this is a genuine
 * supply-chain trust decision distinct from installing a plugin itself.
 */
export const codexAdapter: NativeMarketplaceAdapter = {
  id: "codex",
  kind: "native-marketplace",

  async detect() {
    return resolveBinary("codex") !== null;
  },

  async install(identity, options = {}) {
    await ensureConsent(options);
    await runNativeCommand("npx", ["codex-marketplace", "add", identity.repo, "--plugin", "--global"]);
  },

  async remove(identity, options = {}) {
    await ensureConsent(options);
    await runNativeCommand("npx", ["codex-marketplace", "remove", identity.pluginName, "--global"]);
  },
};
