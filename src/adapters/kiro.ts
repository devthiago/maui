/**
 * Kiro's steering files live at .kiro/steering/ relative to a scope root
 * (project dir or $HOME) — confirmed for both project and global scope at
 * kiro.dev/docs/steering/. Unlike the generic-agents adapter, Kiro's own
 * dot-folder name isn't baked into the adapter root; a plugin's manifest
 * supplies the full ".kiro/steering/" destination itself.
 */
export const kiroAdapter = {
  id: "kiro",
  globalRoot(home: string): string {
    return home;
  },
};
