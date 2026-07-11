/**
 * Windsurf's project-level rules (.windsurf/rules/*.md, or the preferred
 * .devin/rules/*.md since the Devin/Cognition merge) are a real directory,
 * confirmed at docs.devin.ai/desktop/cascade/memories — fits the
 * per-child-symlink model directly. Windsurf's global rules file
 * (~/.codeium/windsurf/memories/global_rules.md) is a single shared file,
 * not a directory — doesn't fit this adapter shape at all; no globalRoot
 * here. Revisit global support later via the postinstall/upsertBlock
 * mechanism instead, not a directory-symlink target.
 */
export const windsurfAdapter = {
  id: "windsurf",
  projectRoot(cwd: string): string {
    return cwd;
  },
};
