import { join } from "node:path";
import { resolveBinary } from "../core/marketplace-exec";

/**
 * Kimi Code CLI's plugin/marketplace management (`/plugins install <url>`,
 * `/plugins marketplace add`) is TUI-only — confirmed at
 * kimi.com/code/docs/en/kimi-code-cli/customization/plugins.html: every
 * documented example is a slash command typed inside a running `kimi`
 * session, and no plain shell subcommand like `kimi plugin install`
 * exists. That rules out a native-marketplace adapter the same way it
 * ruled out OpenCode — there's nothing non-interactive to shell out to.
 *
 * Kimi does have genuine plain-folder Skills and Agents conventions,
 * independent of its managed-plugin system, confirmed at kimi.com/code/
 * docs/en/kimi-code-cli/customization/{skills,agents}.html: project scope
 * scans `.kimi-code/skills/` and `.kimi-code/agents/` (plus
 * `.agents/skills/` and `.agents/agents/`, already covered by maui's
 * always-on fallback), user scope scans `$KIMI_CODE_HOME/{skills,agents}/`
 * (defaults to `~/.kimi-code/...`) plus `~/.agents/{skills,agents}/`.
 * There's no separate commands/rules *destination* folder — Kimi's
 * customization docs list only mcp/skills/plugins/datasource/agents/hooks
 * — but a flat `.md` file placed directly in a skills directory is itself
 * treated as a skill (Kimi's equivalent of a Claude Code "command"). So a
 * plugin's `commands/` source folder is worth supporting too, just routed
 * into the same `skills/` destination rather than a dedicated one: two
 * source keys (`skills/` and `commands/`) both targeting `skills/` is
 * fine, `linkChildren` treats each call independently and just adds more
 * children to the same real directory (see `core/linker.ts`).
 *
 * Kimi is CLI-first like OpenCode — you launch `kimi` to do anything —
 * so detection checks `Bun.which("kimi")` rather than the config folder
 * existing, since a stray `~/.kimi-code` folder (e.g. from dotfile sync)
 * proves nothing about whether Kimi itself is installed.
 */
export const kimiAdapter = {
  id: "kimi",
  globalRoot(home: string): string {
    return join(home, ".kimi-code");
  },
  projectRoot(cwd: string): string {
    return join(cwd, ".kimi-code");
  },
  async detect(): Promise<boolean> {
    return resolveBinary("kimi") !== null;
  },
};
