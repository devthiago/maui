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

export interface MarketplaceScaffoldOptions {
  marketplaceName: string;
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

const MARKETPLACE_BUMP_VERSION_SCRIPT = `import { join } from "node:path";

const newVersion = process.argv[2];
if (!newVersion) {
  console.error("Usage: bun run version:bump <new-version>");
  process.exit(1);
}

async function bumpJson(relativePath: string, apply: (json: any) => void): Promise<boolean> {
  const path = join(process.cwd(), relativePath);
  const target = Bun.file(path);
  if (!(await target.exists())) return false;

  const json = await target.json();
  apply(json);
  await Bun.write(path, \`\${JSON.stringify(json, null, 2)}\\n\`);
  return true;
}

await bumpJson("package.json", (json) => {
  json.version = newVersion;
});
await bumpJson(".claude-plugin/marketplace.json", (json) => {
  json.metadata = json.metadata ?? {};
  json.metadata.version = newVersion;
});
await bumpJson("gemini-extension.json", (json) => {
  json.version = newVersion;
});
await bumpJson(".agents/plugins/marketplace.json", (json) => {
  // No confirmed top-level version field for this file — only bump it if
  // one is already present, never invent one.
  if ("version" in json) json.version = newVersion;
});

console.log(\`Bumped marketplace version to \${newVersion}.\`);
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
    owner: { name: options.githubUser },
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

/**
 * Scaffolds a multi-plugin marketplace repo shell per SPEC.md's
 * "create-marketplace" section, confirmed against wshobson/agents: root
 * .claude-plugin/marketplace.json and .agents/plugins/marketplace.json
 * (both starting with an empty plugins array, populated later by
 * scaffoldPluginInMarketplace), a single repo-level gemini-extension.json
 * (Gemini has no per-plugin marketplace concept), and an empty plugins/
 * folder. Initializes git locally — never pushes or adds a remote.
 */
export async function scaffoldMarketplace(options: MarketplaceScaffoldOptions): Promise<string> {
  const targetDir = options.targetDir ?? join(process.cwd(), options.marketplaceName);
  const description = options.description ?? "";
  const version = "0.1.0";

  await mkdir(join(targetDir, ".claude-plugin"), { recursive: true });
  await writeJson(join(targetDir, ".claude-plugin", "marketplace.json"), {
    name: options.marketplaceName,
    owner: { name: options.githubUser },
    metadata: { description, version },
    plugins: [],
  });

  await mkdir(join(targetDir, ".agents", "plugins"), { recursive: true });
  await writeJson(join(targetDir, ".agents", "plugins", "marketplace.json"), {
    name: options.marketplaceName,
    plugins: [],
  });

  await writeJson(join(targetDir, "gemini-extension.json"), {
    name: options.marketplaceName,
    version,
    description,
    contextFileName: "AGENTS.md",
  });

  await mkdir(join(targetDir, "plugins"), { recursive: true });
  await Bun.write(join(targetDir, "plugins", ".gitkeep"), "");

  await writeJson(join(targetDir, "package.json"), {
    name: options.marketplaceName,
    version,
    description,
    private: true,
    ...(options.license ? { license: options.license } : {}),
    scripts: {
      "version:bump": "bun run scripts/bump-version.ts",
    },
  });

  await mkdir(join(targetDir, "scripts"), { recursive: true });
  await Bun.write(join(targetDir, "scripts", "bump-version.ts"), MARKETPLACE_BUMP_VERSION_SCRIPT);

  await $`git init -q ${targetDir}`.quiet();

  return targetDir;
}
