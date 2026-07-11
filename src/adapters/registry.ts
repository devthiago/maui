import { genericAgentsAdapter } from "./generic-agents";
import { kiroAdapter } from "./kiro";
import { cursorAdapter } from "./cursor";
import { windsurfAdapter } from "./windsurf";
import { claudeCodeAdapter } from "./claude-code";
import { geminiAdapter } from "./gemini";
import { codexAdapter } from "./codex";
import { openCodeAdapter } from "./opencode";
import { grokAdapter } from "./grok";
import type { NativeMarketplaceAdapter } from "../types";

export interface GlobalSymlinkAdapter {
  id: string;
  /** Omitted => this adapter has no global filesystem target (e.g. Cursor's
   * "User Rules" are UI/database-managed); global installs skip it. */
  globalRoot?(home: string): string;
  /** Omitted => always considered present (the always-on .agents fallback). */
  detect?(home: string): Promise<boolean>;
  /** Omitted => this adapter has no project-scope target; project installs skip it. */
  projectRoot?(cwd: string): string;
}

const SYMLINK_ADAPTERS: Record<string, GlobalSymlinkAdapter> = {
  [genericAgentsAdapter.id]: genericAgentsAdapter,
  [kiroAdapter.id]: kiroAdapter,
  [cursorAdapter.id]: cursorAdapter,
  [windsurfAdapter.id]: windsurfAdapter,
};

const NATIVE_MARKETPLACE_ADAPTERS: Record<string, NativeMarketplaceAdapter> = {
  [claudeCodeAdapter.id]: claudeCodeAdapter,
  [geminiAdapter.id]: geminiAdapter,
  [codexAdapter.id]: codexAdapter,
  [openCodeAdapter.id]: openCodeAdapter,
  [grokAdapter.id]: grokAdapter,
};

export function getSymlinkAdapter(agentId: string): GlobalSymlinkAdapter | undefined {
  return SYMLINK_ADAPTERS[agentId];
}

export function getNativeMarketplaceAdapter(agentId: string): NativeMarketplaceAdapter | undefined {
  return NATIVE_MARKETPLACE_ADAPTERS[agentId];
}
