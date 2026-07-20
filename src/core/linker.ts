import { lstat, mkdir, readdir, readlink, rename, rm, symlink } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface LinkResult {
  container: string;
  linked: string[];
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Links each immediate child of `sourceDir` into `containerDir` as its own
 * symlink, creating containerDir as a real directory if missing. Never
 * symlinks containerDir itself, so multiple plugins can share one container
 * without clobbering each other's children.
 *
 * A pre-existing item at a child's target path is left alone if it's
 * already a symlink pointing at this exact source (idempotent re-link).
 * Otherwise it's renamed to `<child-name>.maui-backup-<timestamp>` before
 * the symlink is placed, so nothing is silently destroyed.
 */
export async function linkChildren(sourceDir: string, containerDir: string): Promise<LinkResult> {
  await mkdir(containerDir, { recursive: true });

  const entries = await readdir(sourceDir, { withFileTypes: true });
  const linked: string[] = [];

  for (const entry of entries) {
    const sourceChild = join(sourceDir, entry.name);
    const targetChild = join(containerDir, entry.name);

    if (await pathExists(targetChild)) {
      const stat = await lstat(targetChild);
      if (stat.isSymbolicLink()) {
        const currentTarget = await readlink(targetChild);
        if (currentTarget === sourceChild) {
          linked.push(targetChild);
          continue;
        }
      }
      const backupPath = join(containerDir, `${entry.name}.maui-backup-${Date.now()}`);
      await rename(targetChild, backupPath);
    }

    await symlink(sourceChild, targetChild);
    linked.push(targetChild);
  }

  return { container: containerDir, linked };
}

/**
 * Symlinks a single source file to a destination path that may have a
 * different name (e.g. a plugin's hooks/opencode-hooks.ts renamed to
 * <plugin-name>.ts in OpenCode's plugins/ folder). Returns null without
 * creating anything if the source file doesn't exist — not every plugin
 * has this file, and that's not an error. Same backup-on-conflict and
 * idempotent-relink behavior as linkChildren, just for one file instead of
 * a directory's children.
 */
export async function linkRenamedFile(sourceFile: string, destFile: string): Promise<string | null> {
  if (!(await pathExists(sourceFile))) return null;

  await mkdir(dirname(destFile), { recursive: true });

  if (await pathExists(destFile)) {
    const stat = await lstat(destFile);
    if (stat.isSymbolicLink()) {
      const currentTarget = await readlink(destFile);
      if (currentTarget === sourceFile) {
        return destFile;
      }
    }
    const backupPath = `${destFile}.maui-backup-${Date.now()}`;
    await rename(destFile, backupPath);
  }

  await symlink(sourceFile, destFile);
  return destFile;
}

/**
 * Removes exactly the given symlink paths (as tracked by the registry for a
 * plugin+agent+scope), leaving the shared container and any other plugin's
 * symlinks in it untouched.
 */
export async function unlinkChildren(linked: string[]): Promise<void> {
  for (const path of linked) {
    if (!(await pathExists(path))) continue;
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) {
      await rm(path, { force: true });
    }
  }
}
