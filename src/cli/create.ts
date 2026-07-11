import { createInterface } from "node:readline/promises";
import { scaffoldPlugin } from "../core/scaffold";

export interface CreateOptions {
  prompt?: (question: string) => Promise<string>;
  targetDir?: string;
}

async function defaultPrompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

export async function createPlugin(pluginNameArg: string, options: CreateOptions = {}): Promise<string> {
  const prompt = options.prompt ?? defaultPrompt;

  const pluginName = (await prompt(`Plugin name [${pluginNameArg}]: `)).trim() || pluginNameArg;
  const githubUser = (await prompt("GitHub username/org: ")).trim();
  const description = (await prompt("Short description (optional): ")).trim();
  const license = (await prompt("License (optional, e.g. MIT): ")).trim();

  return scaffoldPlugin({
    pluginName,
    githubUser,
    description: description || undefined,
    license: license || undefined,
    targetDir: options.targetDir,
  });
}
