import type { MarketplaceCatalogEntry } from "./source-mode";
import { prompt as defaultPrompt } from "./prompt";

export interface PluginSelectionOptions {
  pluginFlags?: string[];
  allPlugins?: boolean;
  isTTY?: boolean;
  prompt?: (question: string) => Promise<string>;
}

export class PluginSelectionRequiredError extends Error {
  constructor(catalog: MarketplaceCatalogEntry[]) {
    super(
      `This source is a multi-plugin marketplace — pass --plugin <name> ` +
        `(repeatable) or --all-plugins to select which to install. ` +
        `Available plugins: ${catalog.map((entry) => entry.name).join(", ")}`
    );
    this.name = "PluginSelectionRequiredError";
  }
}

export class InvalidPluginSelectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPluginSelectionError";
  }
}

function formatCatalogList(catalog: MarketplaceCatalogEntry[]): string {
  return catalog
    .map((entry, index) => {
      const description = entry.description ? ` — ${entry.description}` : "";
      return `  ${index + 1}. ${entry.name}${description}`;
    })
    .join("\n");
}

function parseInteractiveSelection(
  answer: string,
  catalog: MarketplaceCatalogEntry[]
): MarketplaceCatalogEntry[] {
  const trimmed = answer.trim();
  if (/^all$/i.test(trimmed)) {
    return catalog;
  }

  const parts = trimmed
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (parts.length === 0) {
    throw new InvalidPluginSelectionError(
      'No selection entered — enter comma-separated numbers or "all".'
    );
  }

  return parts.map((part) => {
    const index = Number(part);
    if (!Number.isInteger(index) || index < 1 || index > catalog.length) {
      throw new InvalidPluginSelectionError(
        `"${part}" is not a valid selection — enter a number between 1 and ${catalog.length}, comma-separated, or "all".`
      );
    }
    return catalog[index - 1]!;
  });
}

function selectByName(names: string[], catalog: MarketplaceCatalogEntry[]): MarketplaceCatalogEntry[] {
  return names.map((name) => {
    const entry = catalog.find((candidate) => candidate.name === name);
    if (!entry) {
      throw new InvalidPluginSelectionError(
        `"${name}" is not a plugin in this marketplace. Available plugins: ${catalog
          .map((candidate) => candidate.name)
          .join(", ")}`
      );
    }
    return entry;
  });
}

/**
 * Resolves which of a marketplace's catalogued plugins to install/act on.
 * `--plugin`/`--all-plugins` always short-circuit the prompt, interactive
 * or not. With neither and a TTY, prints a numbered list and parses a
 * comma-separated answer (or "all"). With neither and no TTY, throws
 * rather than guessing — maui never silently installs every plugin in a
 * marketplace it wasn't explicitly told to.
 */
export async function selectPlugins(
  catalog: MarketplaceCatalogEntry[],
  options: PluginSelectionOptions = {}
): Promise<MarketplaceCatalogEntry[]> {
  if (options.allPlugins) {
    return catalog;
  }

  if (options.pluginFlags && options.pluginFlags.length > 0) {
    return selectByName(options.pluginFlags, catalog);
  }

  const isTTY = options.isTTY ?? process.stdin.isTTY === true;
  if (!isTTY) {
    throw new PluginSelectionRequiredError(catalog);
  }

  const ask = options.prompt ?? defaultPrompt;
  console.log(`This is a marketplace with ${catalog.length} plugins:`);
  console.log(formatCatalogList(catalog));
  const answer = await ask('Select plugins to install (comma-separated numbers, or "all"): ');
  return parseInteractiveSelection(answer, catalog);
}
