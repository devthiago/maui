import { describe, it, expect } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile, lstat, readdir, readFile, readlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { linkChildren, linkRenamedFile, unlinkChildren } from "../../src/core/linker";

async function withTmpDir(prefix: string, fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function makePluginSkills(root: string, pluginName: string, skillNames: string[]): Promise<string> {
  const sourceDir = join(root, pluginName, "skills");
  for (const skill of skillNames) {
    await mkdir(join(sourceDir, skill), { recursive: true });
    await writeFile(join(sourceDir, skill, "SKILL.md"), `# ${skill}\n`);
  }
  return sourceDir;
}

describe("linkChildren", () => {
  it("creates the container as a real dir and symlinks each child individually", async () => {
    await withTmpDir("maui-linker-", async (root) => {
      const source = await makePluginSkills(root, "plugin-a", ["code-review", "db-migrate"]);
      const container = join(root, "agent-home", "skills");

      const result = await linkChildren(source, container);

      const containerStat = await lstat(container);
      expect(containerStat.isSymbolicLink()).toBe(false);
      expect(containerStat.isDirectory()).toBe(true);

      for (const skill of ["code-review", "db-migrate"]) {
        const childStat = await lstat(join(container, skill));
        expect(childStat.isSymbolicLink()).toBe(true);
      }
      expect(result.linked.sort()).toEqual(
        [join(container, "code-review"), join(container, "db-migrate")].sort()
      );
    });
  });

  it("lets a second plugin share the same container without disturbing the first plugin's symlinks", async () => {
    await withTmpDir("maui-linker-", async (root) => {
      const sourceA = await makePluginSkills(root, "plugin-a", ["code-review"]);
      const sourceB = await makePluginSkills(root, "plugin-b", ["db-migrate"]);
      const container = join(root, "agent-home", "skills");

      await linkChildren(sourceA, container);
      await linkChildren(sourceB, container);

      const entries = await readdir(container);
      expect(entries.sort()).toEqual(["code-review", "db-migrate"]);

      const codeReviewLink = await lstat(join(container, "code-review"));
      const dbMigrateLink = await lstat(join(container, "db-migrate"));
      expect(codeReviewLink.isSymbolicLink()).toBe(true);
      expect(dbMigrateLink.isSymbolicLink()).toBe(true);
    });
  });

  it("backs up a pre-existing non-symlink item instead of overwriting it", async () => {
    await withTmpDir("maui-linker-", async (root) => {
      const source = await makePluginSkills(root, "plugin-a", ["code-review"]);
      const container = join(root, "agent-home", "skills");
      await mkdir(container, { recursive: true });
      await writeFile(join(container, "code-review"), "pre-existing user content\n");

      await linkChildren(source, container);

      const linkStat = await lstat(join(container, "code-review"));
      expect(linkStat.isSymbolicLink()).toBe(true);

      const entries = await readdir(container);
      const backupName = entries.find((name) => name.startsWith("code-review.maui-backup-"));
      expect(backupName).toBeDefined();
      const backupContent = await readFile(join(container, backupName!), "utf-8");
      expect(backupContent).toBe("pre-existing user content\n");
    });
  });

  it("re-linking the same plugin's own symlink is a no-op, not a backup", async () => {
    await withTmpDir("maui-linker-", async (root) => {
      const source = await makePluginSkills(root, "plugin-a", ["code-review"]);
      const container = join(root, "agent-home", "skills");

      await linkChildren(source, container);
      await linkChildren(source, container);

      const entries = await readdir(container);
      expect(entries).toEqual(["code-review"]);
    });
  });
});

describe("linkRenamedFile", () => {
  it("symlinks a single source file to a differently-named destination path", async () => {
    await withTmpDir("maui-linker-", async (root) => {
      const sourceFile = join(root, "plugin-a", "hooks", "opencode-hooks.ts");
      await mkdir(join(root, "plugin-a", "hooks"), { recursive: true });
      await writeFile(sourceFile, "export const PluginA = async () => ({});\n");
      const destFile = join(root, "opencode-home", "plugins", "plugin-a.ts");

      const linked = await linkRenamedFile(sourceFile, destFile);

      expect(linked).toBe(destFile);
      const stat = await lstat(destFile);
      expect(stat.isSymbolicLink()).toBe(true);
      expect(await readlink(destFile)).toBe(sourceFile);
    });
  });

  it("returns null and creates nothing when the source file doesn't exist", async () => {
    await withTmpDir("maui-linker-", async (root) => {
      const sourceFile = join(root, "plugin-a", "hooks", "opencode-hooks.ts");
      const destFile = join(root, "opencode-home", "plugins", "plugin-a.ts");

      const linked = await linkRenamedFile(sourceFile, destFile);

      expect(linked).toBeNull();
      expect(await Bun.file(destFile).exists()).toBe(false);
    });
  });

  it("backs up a pre-existing non-symlink file instead of overwriting it", async () => {
    await withTmpDir("maui-linker-", async (root) => {
      const sourceFile = join(root, "plugin-a", "hooks", "opencode-hooks.ts");
      await mkdir(join(root, "plugin-a", "hooks"), { recursive: true });
      await writeFile(sourceFile, "export const PluginA = async () => ({});\n");
      const destDir = join(root, "opencode-home", "plugins");
      await mkdir(destDir, { recursive: true });
      const destFile = join(destDir, "plugin-a.ts");
      await writeFile(destFile, "pre-existing user content\n");

      await linkRenamedFile(sourceFile, destFile);

      const stat = await lstat(destFile);
      expect(stat.isSymbolicLink()).toBe(true);

      const entries = await readdir(destDir);
      const backupName = entries.find((name) => name.startsWith("plugin-a.ts.maui-backup-"));
      expect(backupName).toBeDefined();
      const backupContent = await readFile(join(destDir, backupName!), "utf-8");
      expect(backupContent).toBe("pre-existing user content\n");
    });
  });

  it("re-linking the same source is a no-op, not a backup", async () => {
    await withTmpDir("maui-linker-", async (root) => {
      const sourceFile = join(root, "plugin-a", "hooks", "opencode-hooks.ts");
      await mkdir(join(root, "plugin-a", "hooks"), { recursive: true });
      await writeFile(sourceFile, "export const PluginA = async () => ({});\n");
      const destFile = join(root, "opencode-home", "plugins", "plugin-a.ts");

      await linkRenamedFile(sourceFile, destFile);
      await linkRenamedFile(sourceFile, destFile);

      const destDir = join(root, "opencode-home", "plugins");
      const entries = await readdir(destDir);
      expect(entries).toEqual(["plugin-a.ts"]);
    });
  });
});

describe("unlinkChildren", () => {
  it("removes exactly the given plugin's symlinks, leaving the shared container and other plugins intact", async () => {
    await withTmpDir("maui-linker-", async (root) => {
      const sourceA = await makePluginSkills(root, "plugin-a", ["code-review"]);
      const sourceB = await makePluginSkills(root, "plugin-b", ["db-migrate"]);
      const container = join(root, "agent-home", "skills");

      const resultA = await linkChildren(sourceA, container);
      await linkChildren(sourceB, container);

      await unlinkChildren(resultA.linked);

      const entries = await readdir(container);
      expect(entries).toEqual(["db-migrate"]);
      const containerStat = await lstat(container);
      expect(containerStat.isDirectory()).toBe(true);
    });
  });
});
