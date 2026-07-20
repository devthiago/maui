import { join } from "node:path";
import { resolveBinary } from "../core/marketplace-exec";
import { linkRenamedFile } from "../core/linker";

/**
 * OpenCode plugins are conceptually closer to Claude Code / Codex *hooks*
 * than to their marketplace-installed plugins — see opencode.ai/docs/plugins/.
 * There's no `opencode plugin install <git-source>` marketplace command;
 * plugins are just files discovered from a folder. Confirmed conventions
 * (opencode.ai/docs/plugins/, /docs/skills/, /docs/commands/, /docs/agents/):
 *
 *   - project scope:  .opencode/
 *   - global scope:   ~/.config/opencode/
 *
 * A plugin's `skills/`, `commands/`, `agents/`, `rules/` etc. are symlinked
 * per-child into their respective .opencode subfolder exactly like every
 * other symlink adapter, via the manifest's own SymlinkTargetMap — nothing
 * OpenCode-specific about that part.
 *
 * The one OpenCode-specific piece is `linkExtra`: if the plugin ships a
 * `hooks/opencode-hooks.ts` file, it's symlinked into `.../plugins/` and
 * *renamed* to `<plugin-name>.ts`, since that's the file OpenCode actually
 * loads at startup (opencode.ai/docs/plugins/#create-a-plugin).
 */
export const openCodeAdapter = {
  id: "opencode",

  globalRoot(home: string): string {
    return join(home, ".config", "opencode");
  },

  projectRoot(cwd: string): string {
    return join(cwd, ".opencode");
  },

  async detect(): Promise<boolean> {
    return resolveBinary("opencode") !== null;
  },

  async linkExtra(pluginDir: string, rootDir: string, pluginName: string): Promise<string[]> {
    const hooksFile = join(pluginDir, "hooks", "opencode-hooks.ts");
    const destFile = join(rootDir, "plugins", `${pluginName}.ts`);
    const linked = await linkRenamedFile(hooksFile, destFile);
    return linked ? [linked] : [];
  },
};
