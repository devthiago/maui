import { join } from "node:path";

/**
 * The always-on `.agents` fallback: populated on every `maui install`,
 * unconditionally, regardless of which specific agents were detected.
 */
export const genericAgentsAdapter = {
  id: "_default",
  globalRoot(home: string): string {
    return join(home, ".agents");
  },
};
