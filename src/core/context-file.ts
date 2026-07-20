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
 * Gemini CLI: geminicli.com/docs/cli/gemini-md/ (global path confirmed;
 * project path assumed by symmetry, not independently verified). OpenCode:
 * opencode.ai/docs/rules/ — a project-root AGENTS.md (already the generic
 * fallback, listed here for clarity) and ~/.config/opencode/AGENTS.md
 * globally. Every other agent falls back to the generic .agents
 * convention's AGENTS.md rather than a guessed filename — see SPEC.md Open
 * Question #8.
 */
const CONTEXT_FILES: Record<string, ContextFileConvention> = {
  "claude-code": { global: ".claude/CLAUDE.md", project: "CLAUDE.md" },
  gemini: { global: ".gemini/GEMINI.md", project: "GEMINI.md" },
  opencode: { global: ".config/opencode/AGENTS.md", project: "AGENTS.md" },
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
