import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface ProjectConfig {
  plugins: Record<string, { source: string }>;
}

export function projectConfigPath(cwd: string): string {
  return join(cwd, ".maui", "config.json");
}

export async function readProjectConfig(cwd: string): Promise<ProjectConfig | null> {
  const file = Bun.file(projectConfigPath(cwd));
  if (!(await file.exists())) {
    return null;
  }
  return (await file.json()) as ProjectConfig;
}

export async function writeProjectConfig(config: ProjectConfig, cwd: string): Promise<void> {
  const path = projectConfigPath(cwd);
  await mkdir(dirname(path), { recursive: true });
  await Bun.write(path, JSON.stringify(config, null, 2));
}

export async function recordProjectPlugin(
  pluginName: string,
  source: string,
  cwd: string
): Promise<void> {
  const existing = (await readProjectConfig(cwd)) ?? { plugins: {} };
  existing.plugins[pluginName] = { source };
  await writeProjectConfig(existing, cwd);
}
