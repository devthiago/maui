import { genericAgentsAdapter } from "./generic-agents";
import { kiroAdapter } from "./kiro";

export interface GlobalSymlinkAdapter {
  id: string;
  globalRoot(home: string): string;
}

const SYMLINK_ADAPTERS: Record<string, GlobalSymlinkAdapter> = {
  [genericAgentsAdapter.id]: genericAgentsAdapter,
  [kiroAdapter.id]: kiroAdapter,
};

export function getSymlinkAdapter(agentId: string): GlobalSymlinkAdapter | undefined {
  return SYMLINK_ADAPTERS[agentId];
}
