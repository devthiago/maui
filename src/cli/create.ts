import { prompt as promptLine } from "../core/prompt";
import { scaffoldMarketplace, scaffoldPlugin } from "../core/scaffold";

export interface CreateOptions {
  prompt?: (question: string) => Promise<string>;
  targetDir?: string;
  cwd?: string;
}

export async function createPlugin(pluginNameArg: string, options: CreateOptions = {}): Promise<string> {
  const prompt = options.prompt ?? promptLine;

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
    cwd: options.cwd,
  });
}

export async function createMarketplace(
  marketplaceNameArg: string,
  options: CreateOptions = {}
): Promise<string> {
  const prompt = options.prompt ?? promptLine;

  const marketplaceName = (await prompt(`Marketplace name [${marketplaceNameArg}]: `)).trim() || marketplaceNameArg;
  const githubUser = (await prompt("GitHub username/org: ")).trim();
  const description = (await prompt("Short description (optional): ")).trim();
  const license = (await prompt("License (optional, e.g. MIT): ")).trim();

  return scaffoldMarketplace({
    marketplaceName,
    githubUser,
    description: description || undefined,
    license: license || undefined,
    targetDir: options.targetDir,
  });
}

/**
 * Thin dispatcher, not a third scaffolding implementation: asks whether
 * this is a single-plugin repo or a multi-plugin marketplace repo, then
 * delegates entirely to createPlugin (standalone mode) or createMarketplace.
 */
export async function create(nameArg: string, options: CreateOptions = {}): Promise<string> {
  const prompt = options.prompt ?? promptLine;

  const answer = (
    await prompt("Is this a single-plugin repo or a multi-plugin marketplace repo? [single/multi]: ")
  )
    .trim()
    .toLowerCase();
  const isMulti = answer.startsWith("m");

  return isMulti ? createMarketplace(nameArg, options) : createPlugin(nameArg, options);
}
