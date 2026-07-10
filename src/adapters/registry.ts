import { genericAgentsAdapter } from "./generic-agents";
import { kiroAdapter } from "./kiro";
import { claudeCodeAdapter } from "./claude-code";
import { geminiAdapter } from "./gemini";
import { codexAdapter } from "./codex";
import { openCodeAdapter } from "./opencode";
import { grokAdapter } from "./grok";
import type { NativeMarketplaceAdapter } from "../types";

export interface GlobalSymlinkAdapter {
  id: string;
  globalRoot(home: string): string;
  /** Omitted => always considered present (the always-on .agents fallback). */
  detect?(home: string): Promise<boolean>;
}

const SYMLINK_ADAPTERS: Record<string, GlobalSymlinkAdapter> = {
  [genericAgentsAdapter.id]: genericAgentsAdapter,
  [kiroAdapter.id]: kiroAdapter,
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
