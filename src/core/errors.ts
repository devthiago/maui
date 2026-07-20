export class PluginNotFoundError extends Error {
  constructor(name: string) {
    super(`Plugin "${name}" is not installed`);
    this.name = "PluginNotFoundError";
  }
}

export class UnsupportedRemovalError extends Error {
  constructor(pluginName: string, hint: string) {
    super(`Removing "${pluginName}" is not supported yet — ${hint}`);
    this.name = "UnsupportedRemovalError";
  }
}

export class MarketplaceModeMismatchError extends Error {
  constructor(expected: "single" | "marketplace", actual: string) {
    super(
      expected === "single"
        ? `This source is a multi-plugin marketplace — use installFromSource() (or the "maui install" CLI, which handles both) instead of installPlugin() for it.`
        : `This source is not a multi-plugin marketplace (mode: ${actual}) — use installPlugin() instead of installMarketplace() for it.`
    );
    this.name = "MarketplaceModeMismatchError";
  }
}
