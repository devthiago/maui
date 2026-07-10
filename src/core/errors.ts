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
