import type { ManifestTarget, PluginManifest } from "../types";

export class ManifestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManifestValidationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateTarget(agentId: string, target: unknown): ManifestTarget {
  if (!isRecord(target)) {
    throw new ManifestValidationError(`targets.${agentId} must be an object`);
  }

  if ("marketplace" in target) {
    if (target.marketplace !== true) {
      throw new ManifestValidationError(
        `targets.${agentId}.marketplace must be literally true when present`
      );
    }
    for (const [key, value] of Object.entries(target)) {
      if (key === "marketplace") continue;
      if (typeof value !== "string") {
        throw new ManifestValidationError(`targets.${agentId}.${key} must be a string`);
      }
    }
    return target as ManifestTarget;
  }

  for (const [sourcePath, destPath] of Object.entries(target)) {
    if (typeof destPath !== "string") {
      throw new ManifestValidationError(
        `targets.${agentId}["${sourcePath}"] must map to a string destination path`
      );
    }
  }
  return target as ManifestTarget;
}

export function parseManifest(raw: unknown): PluginManifest {
  if (!isRecord(raw)) {
    throw new ManifestValidationError("maui.json must be a JSON object");
  }

  const { name, version, description, targets, postinstall, postremove } = raw;

  if (typeof name !== "string" || name.length === 0) {
    throw new ManifestValidationError('maui.json is missing a required "name" string');
  }

  if (typeof version !== "string" || version.length === 0) {
    throw new ManifestValidationError('maui.json is missing a required "version" string');
  }

  if (description !== undefined && typeof description !== "string") {
    throw new ManifestValidationError('"description" must be a string when present');
  }

  if (!isRecord(targets)) {
    throw new ManifestValidationError('maui.json is missing a required "targets" object');
  }

  const validatedTargets: Record<string, ManifestTarget> = {};
  for (const [agentId, target] of Object.entries(targets)) {
    validatedTargets[agentId] = validateTarget(agentId, target);
  }

  if (postinstall !== undefined && typeof postinstall !== "string") {
    throw new ManifestValidationError('"postinstall" must be a string path when present');
  }

  if (postremove !== undefined && typeof postremove !== "string") {
    throw new ManifestValidationError('"postremove" must be a string path when present');
  }

  return {
    name,
    version,
    description,
    targets: validatedTargets,
    postinstall,
    postremove,
  };
}

export async function readManifest(pluginDir: string): Promise<PluginManifest> {
  const file = Bun.file(`${pluginDir}/maui.json`);

  if (!(await file.exists())) {
    throw new ManifestValidationError(`No maui.json found in ${pluginDir}`);
  }

  let raw: unknown;
  try {
    raw = await file.json();
  } catch (error) {
    throw new ManifestValidationError(
      `maui.json in ${pluginDir} is not valid JSON: ${(error as Error).message}`
    );
  }

  return parseManifest(raw);
}
