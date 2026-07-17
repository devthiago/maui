import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { hasConsented, recordConsent } from "./config";
import { confirm as confirmLine } from "./prompt";
import type { PostInstallContext } from "../types";

export interface PostInstallApi {
  upsertBlock(filePath: string, content: string): Promise<void>;
}

function blockMarkers(pluginName: string): { start: string; end: string } {
  return {
    start: `<!-- maui:${pluginName}:start -->`,
    end: `<!-- maui:${pluginName}:end -->`,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Writes/replaces a plugin's own marker-delimited block in a shared
 * contextFile (e.g. CLAUDE.md), so re-running a postinstall is idempotent
 * (no duplicated content on update) and the block can be cleanly located
 * and stripped again on remove — even without a custom postremove script.
 */
export async function upsertBlock(
  filePath: string,
  pluginName: string,
  content: string
): Promise<void> {
  const { start, end } = blockMarkers(pluginName);
  const block = `${start}\n${content.trim()}\n${end}`;
  const pattern = new RegExp(`${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}`);

  await mkdir(dirname(filePath), { recursive: true });
  const file = Bun.file(filePath);
  const existing = (await file.exists()) ? await file.text() : "";

  if (pattern.test(existing)) {
    await Bun.write(filePath, existing.replace(pattern, block));
    return;
  }

  const needsSeparator = existing.length > 0 && !existing.endsWith("\n\n");
  const separator = existing.length === 0 ? "" : needsSeparator ? "\n\n" : "\n";
  await Bun.write(filePath, `${existing}${separator}${block}\n`);
}

/**
 * Strips a plugin's marker-delimited block from a contextFile — maui's own
 * automatic cleanup on remove, independent of whether the plugin defines a
 * postremove script.
 */
export async function stripBlock(filePath: string, pluginName: string): Promise<void> {
  const { start, end } = blockMarkers(pluginName);
  const file = Bun.file(filePath);
  if (!(await file.exists())) return;

  const existing = await file.text();
  const pattern = new RegExp(`\\n*${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}\\n*`);
  const stripped = existing.replace(pattern, "\n").replace(/\n{3,}/g, "\n\n");
  await Bun.write(filePath, stripped);
}

function hashScript(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export interface RunHookOptions {
  home?: string;
  confirm?: (message: string) => Promise<boolean>;
}

/**
 * Runs a plugin's postinstall/postremove script (dynamically imported —
 * there's no OS-level sandbox in v1, so consent is the actual control, not
 * containment). Consent is keyed by plugin name + script content hash: an
 * unchanged script's prior "yes" is remembered, but any change to the
 * script's content is treated as a new trust decision.
 */
export async function runHook(
  scriptPath: string,
  pluginName: string,
  context: PostInstallContext,
  options: RunHookOptions = {}
): Promise<{ contextFilesWritten: string[] }> {
  const home = options.home ?? homedir();
  const scriptContent = await Bun.file(scriptPath).text();
  const consentKey = `postinstall:${pluginName}:${hashScript(scriptContent)}`;

  if (!(await hasConsented(consentKey, home))) {
    const confirm = options.confirm ?? confirmLine;
    const confirmed = await confirm(
      `Plugin "${pluginName}" declares a postinstall/postremove script (${scriptPath}). Allow maui to run it?`
    );
    if (!confirmed) {
      throw new Error(`Postinstall/postremove for "${pluginName}" declined by user`);
    }
    await recordConsent(consentKey, home);
  }

  const mod = await import(scriptPath);
  const hook = mod.default;
  if (typeof hook !== "function") {
    throw new Error(`${scriptPath} must have a default export function`);
  }

  const contextFilesWritten: string[] = [];
  const api: PostInstallApi = {
    upsertBlock: async (filePath, content) => {
      await upsertBlock(filePath, pluginName, content);
      contextFilesWritten.push(filePath);
    },
  };

  await hook(context, api);

  return { contextFilesWritten };
}
