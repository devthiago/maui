import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";
import { readManifest } from "./manifest";

export function pluginsRoot(home: string = homedir()): string {
  return join(home, ".maui", "plugins");
}

function isGitSource(source: string): boolean {
  return (
    /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(source) || // any scheme://
    /^[\w.-]+@[\w.-]+:/.test(source) || // git@host:path SSH shorthand
    source.endsWith(".git")
  );
}

/**
 * Populates ~/.maui/plugins/<manifest.name> from a git URL or local dev path,
 * always wiping and recopying the target so re-fetching the same source is
 * idempotent. Symlinks created into this directory's children (by the
 * linker) still resolve correctly after a refresh, since the directory path
 * itself is stable even though its contents were replaced.
 */
export async function fetchPlugin(source: string, home: string = homedir()): Promise<string> {
  const staging = await mkdtemp(join(tmpdir(), "maui-fetch-"));

  try {
    if (isGitSource(source)) {
      await $`git clone ${source} ${staging}`.quiet();
    } else {
      await cp(source, staging, { recursive: true });
    }

    const manifest = await readManifest(staging);
    const targetDir = join(pluginsRoot(home), manifest.name);

    await mkdir(pluginsRoot(home), { recursive: true });
    await rm(targetDir, { recursive: true, force: true });
    await cp(staging, targetDir, { recursive: true });

    return targetDir;
  } finally {
    await rm(staging, { recursive: true, force: true }).catch(() => {});
  }
}
