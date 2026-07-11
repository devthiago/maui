import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";

export interface ScaffoldOptions {
  pluginName: string;
  githubUser: string;
  description?: string;
  license?: string;
  targetDir?: string;
}

const COMMON_FOLDERS = ["skills", "agents", "commands", "rules", "prompts", "hooks"];

const BUMP_VERSION_SCRIPT = `import { join } from "node:path";

const newVersion = process.argv[2];
if (!newVersion) {
  console.error("Usage: bun run version:bump <new-version>");
  process.exit(1);
}

const files = [
  "package.json",
  ".claude-plugin/plugin.json",
  ".codex-plugin/plugin.json",
  "gemini-extension.json",
  "maui.json",
];

for (const file of files) {
  const path = join(process.cwd(), file);
  const target = Bun.file(path);
  if (!(await target.exists())) continue;

  const json = await target.json();
  json.version = newVersion;
  await Bun.write(path, \`\${JSON.stringify(json, null, 2)}\\n\`);
}

console.log(\`Bumped version to \${newVersion} across \${files.length} files.\`);
`;

async function writeJson(path: string, value: unknown): Promise<void> {
  await Bun.write(path, `${JSON.stringify(value, null, 2)}\n`);
}

/**
 * Scaffolds a new publishable plugin repo per SPEC.md's "Plugin
 * Scaffolding" section: common source folders, a native manifest for each
 * marketplace-based agent, a maui.json wiring everything together, and a
 * package.json with a version:bump script that keeps every manifest's
 * version in sync. Initializes git locally — never pushes or adds a remote.
 */
export async function scaffoldPlugin(options: ScaffoldOptions): Promise<string> {
  const targetDir = options.targetDir ?? join(process.cwd(), options.pluginName);
  const description = options.description ?? "";
  const repo = `${options.githubUser}/${options.pluginName}`;
  const version = "0.1.0";

  for (const folder of COMMON_FOLDERS) {
    await mkdir(join(targetDir, folder), { recursive: true });
    await Bun.write(join(targetDir, folder, ".gitkeep"), "");
  }

  await mkdir(join(targetDir, ".claude-plugin"), { recursive: true });
  await writeJson(join(targetDir, ".claude-plugin", "plugin.json"), {
    name: options.pluginName,
    description,
    version,
    author: { name: options.githubUser },
  });
  await writeJson(join(targetDir, ".claude-plugin", "marketplace.json"), {
    name: options.pluginName,
    plugins: [{ name: options.pluginName, source: ".", description }],
  });

  await mkdir(join(targetDir, ".codex-plugin"), { recursive: true });
  await writeJson(join(targetDir, ".codex-plugin", "plugin.json"), {
    name: options.pluginName,
    description,
    version,
  });

  await writeJson(join(targetDir, "gemini-extension.json"), {
    name: options.pluginName,
    version,
    description,
  });

  await writeJson(join(targetDir, "maui.json"), {
    name: options.pluginName,
    version,
    description,
    targets: {
      "claude-code": { marketplace: true, repo, marketplaceName: options.pluginName },
      codex: { marketplace: true, repo },
      gemini: { marketplace: true, repo: `https://github.com/${repo}` },
      grok: { marketplace: true, repo },
      cursor: { "rules/": ".cursor/rules/" },
      windsurf: { "rules/": ".windsurf/rules/" },
      kiro: { "rules/": ".kiro/steering/" },
      _default: { "skills/": "skills/", "commands/": "commands/" },
    },
  });

  await writeJson(join(targetDir, "package.json"), {
    name: options.pluginName,
    version,
    description,
    private: true,
    ...(options.license ? { license: options.license } : {}),
    scripts: {
      "version:bump": "bun run scripts/bump-version.ts",
    },
  });

  await mkdir(join(targetDir, "scripts"), { recursive: true });
  await Bun.write(join(targetDir, "scripts", "bump-version.ts"), BUMP_VERSION_SCRIPT);

  await $`git init -q ${targetDir}`.quiet();

  return targetDir;
}
