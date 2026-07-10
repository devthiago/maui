import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export interface MauiConfig {
  consents: Record<string, boolean>;
}

export function configPath(home: string = homedir()): string {
  return join(home, ".maui", "config.json");
}

function emptyConfig(): MauiConfig {
  return { consents: {} };
}

export async function readConfig(home: string = homedir()): Promise<MauiConfig> {
  const file = Bun.file(configPath(home));

  if (!(await file.exists())) {
    return emptyConfig();
  }

  return (await file.json()) as MauiConfig;
}

export async function writeConfig(config: MauiConfig, home: string = homedir()): Promise<void> {
  const path = configPath(home);
  await mkdir(dirname(path), { recursive: true });
  await Bun.write(path, JSON.stringify(config, null, 2));
}

export async function hasConsented(key: string, home: string = homedir()): Promise<boolean> {
  const config = await readConfig(home);
  return config.consents[key] === true;
}

export async function recordConsent(key: string, home: string = homedir()): Promise<void> {
  const config = await readConfig(home);
  config.consents[key] = true;
  await writeConfig(config, home);
}
