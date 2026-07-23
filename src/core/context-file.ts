import { join } from "node:path";
import type { Scope } from "../types";

export interface ContextFileOptions {
  home: string;
  projectRoot?: string;
}

interface ContextFileConvention {
  global: string;
  project: string;
}

/**
 * Confirmed conventions only. Claude Code: code.claude.com/docs/en/memory.
 * Gemini CLI: geminicli.com/docs/cli/gemini-md/ — global path confirmed
 * directly; project path confirmed indirectly (the CLI "searches for
 * GEMINI.md files in your configured workspace directories and their
 * parent directories" rather than naming one fixed path, but a project
 * root is unambiguously one of those directories). OpenCode:
 * opencode.ai/docs/rules/ — a project-root AGENTS.md (already the generic
 * fallback, listed here for clarity) and ~/.config/opencode/AGENTS.md
 * globally. Codex: learn.chatgpt.com/docs/codex/cli — project-root
 * AGENTS.md confirmed (`/init` scaffolds one); no global-scope file
 * documented, so its "global" value here is just the fallback's, not an
 * independently confirmed path. Cursor: cursor.com/docs/context/rules —
 * project-root AGENTS.md confirmed as "a plain markdown alternative to
 * .cursor/rules"; no global file exists at all (Cursor's "User Rules" are
 * UI/database-managed), and since `cursorAdapter` has no `globalRoot`,
 * global scope is skipped before a contextFile is ever needed anyway.
 * Windsurf: docs.devin.ai/desktop/cascade/memories — global path confirmed
 * (~/.codeium/windsurf/memories/global_rules.md); no current single-file
 * project convention (workspace rules are a directory; `.windsurfrules` is
 * explicitly documented as legacy), so project stays on the fallback value
 * rather than guessing the legacy filename. Same reachability note as
 * Cursor: `windsurfAdapter` has no `globalRoot` either. Kiro:
 * kiro.dev/docs/steering/ — both confirmed and, unlike Cursor/Windsurf,
 * actually reachable (`kiroAdapter` has a real `globalRoot`): project-root
 * AGENTS.md, and globally `~/.kiro/steering/AGENTS.md` (inside the
 * steering folder, not bare `~/AGENTS.md` — a real, distinct path). Grok:
 * checked docs.x.ai/build/cli/reference again for this task — it documents
 * a `grok memory clear [--workspace|--global|--all]` subcommand but no
 * filename or path convention, so it stays genuinely unconfirmed. Kimi:
 * kimi.com/code/docs/en/kimi-code-cli/customization/agents.html and related
 * pages confirm project-root AGENTS.md and, since `kimiAdapter` has a real
 * `globalRoot` (unlike Cursor/Windsurf), an independently reachable global
 * path at `$KIMI_CODE_HOME/AGENTS.md` (defaults to `~/.kimi-code/AGENTS.md`)
 * — worth its own entry rather than falling through to the bare
 * `~/AGENTS.md` fallback below. Every other/unconfirmed agent falls back to
 * the generic .agents convention's AGENTS.md rather than a guessed filename
 * — see SPEC.md Open Question #8.
 */
const CONTEXT_FILES: Record<string, ContextFileConvention> = {
  "claude-code": { global: ".claude/CLAUDE.md", project: "CLAUDE.md" },
  gemini: { global: ".gemini/GEMINI.md", project: "GEMINI.md" },
  opencode: { global: ".config/opencode/AGENTS.md", project: "AGENTS.md" },
  codex: { global: "AGENTS.md", project: "AGENTS.md" },
  cursor: { global: "AGENTS.md", project: "AGENTS.md" },
  windsurf: { global: ".codeium/windsurf/memories/global_rules.md", project: "AGENTS.md" },
  kiro: { global: ".kiro/steering/AGENTS.md", project: "AGENTS.md" },
  kimi: { global: ".kimi-code/AGENTS.md", project: "AGENTS.md" },
};

const FALLBACK: ContextFileConvention = { global: "AGENTS.md", project: "AGENTS.md" };

export function resolveContextFile(
  agentId: string,
  scope: Scope,
  options: ContextFileOptions
): string {
  const convention = CONTEXT_FILES[agentId] ?? FALLBACK;
  const relativePath = scope === "global" ? convention.global : convention.project;
  const scopeRoot = scope === "global" ? options.home : options.projectRoot ?? process.cwd();

  return join(scopeRoot, relativePath);
}
