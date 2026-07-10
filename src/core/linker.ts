import { lstat, mkdir, readdir, readlink, rename, rm, symlink } from "node:fs/promises";
import { join } from "node:path";

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
