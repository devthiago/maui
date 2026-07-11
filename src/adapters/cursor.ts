/**
 * Cursor's project-level rules (.cursor/rules/*.mdc) are a real directory,
 * confirmed at cursor.com/docs/context/rules — fits the per-child-symlink
 * model directly. Cursor's global "User Rules" are managed through
 * Cursor's own UI/database, not a filesystem folder — no globalRoot here;
 * the always-on .agents fallback covers the global case instead.
 */
export const cursorAdapter = {
  id: "cursor",
  projectRoot(cwd: string): string {
    return cwd;
  },
};
