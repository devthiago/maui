export class PluginNotFoundError extends Error {
  constructor(name: string) {
    super(`Plugin "${name}" is not installed`);
    this.name = "PluginNotFoundError";
  }
}
