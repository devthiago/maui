import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";

export interface ScaffoldOptions {
  pluginName: string;
  githubUser: string;
  description?: string;
  license?: string;
  targetDir?: string;
  /** Directory to check for an existing marketplace project. Defaults to process.cwd(). */
  cwd?: string;
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

function pluginInMarketplaceBumpVersionScript(pluginName: string): string {
  return `import { join } from "node:path";

const newVersion = process.argv[2];
if (!newVersion) {
  console.error("Usage: bun run version:bump <new-version>");
  process.exit(1);
}

const pluginName = ${JSON.stringify(pluginName)};

async function bumpJson(relativePath: string, apply: (json: any) => void): Promise<void> {
  const path = join(process.cwd(), relativePath);
  const target = Bun.file(path);
  if (!(await target.exists())) return;

  const json = await target.json();
  apply(json);
  await Bun.write(path, \`\${JSON.stringify(json, null, 2)}\\n\`);
}

// Syncs this plugin's own entry (matched by name) inside a shared
// marketplace manifest two directories up (plugins/<name>/ -> repo root).
// Never touches the marketplace's own top-level/metadata version.
async function bumpMarketplaceEntry(relativePath: string): Promise<void> {
  const path = join(process.cwd(), relativePath);
  const target = Bun.file(path);
  if (!(await target.exists())) return;

  const json = await target.json();
  const entry = Array.isArray(json.plugins)
    ? json.plugins.find((p: any) => p?.name === pluginName)
    : undefined;
  if (entry && "version" in entry) {
    entry.version = newVersion;
    await Bun.write(path, \`\${JSON.stringify(json, null, 2)}\\n\`);
  }
}

await bumpJson("package.json", (json) => {
  json.version = newVersion;
});
await bumpJson(".claude-plugin/plugin.json", (json) => {
  json.version = newVersion;
});
await bumpJson(".codex-plugin/plugin.json", (json) => {
  json.version = newVersion;
});
await bumpMarketplaceEntry("../../.claude-plugin/marketplace.json");
await bumpMarketplaceEntry("../../.agents/plugins/marketplace.json");

console.log(\`Bumped \${pluginName} to \${newVersion}, including its entry in the shared marketplace manifest.\`);
`;
}

/**
 * Inserts or replaces (matched by "name") an entry in a marketplace.json's
 * "plugins" array. No-ops if the file doesn't exist, so callers don't need
 * to check for optional manifests like .agents/plugins/marketplace.json
 * themselves.
 */
async function upsertMarketplaceEntry(
  marketplaceJsonPath: string,
  entry: Record<string, unknown>
): Promise<void> {
  const file = Bun.file(marketplaceJsonPath);
  if (!(await file.exists())) return;

  const json = await file.json();
  const plugins: Record<string, unknown>[] = Array.isArray(json.plugins) ? json.plugins : [];
  const index = plugins.findIndex((p) => p?.name === entry.name);
  if (index >= 0) {
    plugins[index] = entry;
  } else {
    plugins.push(entry);
  }
  json.plugins = plugins;
  await Bun.write(marketplaceJsonPath, `${JSON.stringify(json, null, 2)}\n`);
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await Bun.write(path, `${JSON.stringify(value, null, 2)}\n`);
}

/**
 * Scaffolds a plugin, in whichever shape fits where it's being created.
 * Detects an existing marketplace project by checking for
 * `<cwd>/.claude-plugin/marketplace.json`: absent means standalone mode
 * (the original single-plugin scaffold, unchanged); present means
 * marketplace mode (a plugin folder inside an existing repo's `plugins/`,
 * with entries appended to the shared manifests instead of duplicating them).
 */
export async function scaffoldPlugin(options: ScaffoldOptions): Promise<string> {
  const cwd = options.cwd ?? process.cwd();
  const inMarketplace = await Bun.file(join(cwd, ".claude-plugin", "marketplace.json")).exists();

  if (inMarketplace) {
    return scaffoldPluginInMarketplace(options, cwd);
  }

  return scaffoldStandalonePlugin(options);
}

/**
 * The original single-plugin scaffold: common source folders, a native
 * manifest for each marketplace-based agent, a maui.json wiring everything
 * together, and a package.json with a version:bump script that keeps every
 * manifest's version in sync. Initializes git locally — never pushes or
 * adds a remote.
 */
async function scaffoldStandalonePlugin(options: ScaffoldOptions): Promise<string> {
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
 * Scaffolds a plugin into an existing marketplace repo's plugins/ folder:
 * only the plugin's own manifests and source folders — no marketplace.json,
 * gemini-extension.json, or maui.json, since those are repo-level and
 * already exist. Appends (or replaces, matched by name) this plugin's
 * entry in the shared .claude-plugin/marketplace.json and
 * .agents/plugins/marketplace.json instead of requiring manual edits.
 */
async function scaffoldPluginInMarketplace(options: ScaffoldOptions, cwd: string): Promise<string> {
  const targetDir = options.targetDir ?? join(cwd, "plugins", options.pluginName);
  const description = options.description ?? "";
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

  await mkdir(join(targetDir, ".codex-plugin"), { recursive: true });
  await writeJson(join(targetDir, ".codex-plugin", "plugin.json"), {
    name: options.pluginName,
    description,
    version,
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
  await Bun.write(
    join(targetDir, "scripts", "bump-version.ts"),
    pluginInMarketplaceBumpVersionScript(options.pluginName)
  );

  const pluginSource = `./plugins/${options.pluginName}`;
  await upsertMarketplaceEntry(join(cwd, ".claude-plugin", "marketplace.json"), {
    name: options.pluginName,
    source: pluginSource,
    description,
    version,
    author: { name: options.githubUser },
  });
  await upsertMarketplaceEntry(join(cwd, ".agents", "plugins", "marketplace.json"), {
    name: options.pluginName,
    source: pluginSource,
  });

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
