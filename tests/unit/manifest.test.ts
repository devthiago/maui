import { describe, it, expect } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseManifest, readManifest, ManifestValidationError } from "../../src/core/manifest";

const VALID_MANIFEST = {
  name: "example-plugin",
  version: "1.0.0",
  description: "Example skill pack",
  targets: {
    "claude-code": { marketplace: true },
    codex: { marketplace: true },
    gemini: { marketplace: true },
    opencode: { marketplace: true, package: "@example/example-plugin" },
    grok: { marketplace: true },
    cursor: {
      "cursor-rules/": ".cursor/rules/",
    },
    windsurf: {
      "skills/": ".windsurf/skills/",
    },
    _default: {
      "skills/": "skills/",
      "commands/": "commands/",
    },
  },
  postinstall: "postinstall.ts",
  postremove: "postremove.ts",
};

describe("parseManifest", () => {
  it("parses a valid manifest matching SPEC.md's example into the typed shape", () => {
    const manifest = parseManifest(VALID_MANIFEST);

    expect(manifest.name).toBe("example-plugin");
    expect(manifest.version).toBe("1.0.0");
    expect(manifest.targets["claude-code"]).toEqual({ marketplace: true });
    expect(manifest.targets.opencode).toEqual({
      marketplace: true,
      package: "@example/example-plugin",
    });
    expect(manifest.targets.cursor).toEqual({ "cursor-rules/": ".cursor/rules/" });
    expect(manifest.postinstall).toBe("postinstall.ts");
    expect(manifest.postremove).toBe("postremove.ts");
  });

  it("parses fine when postinstall and postremove are both omitted", () => {
    const { postinstall, postremove, ...withoutHooks } = VALID_MANIFEST;
    const manifest = parseManifest(withoutHooks);

    expect(manifest.postinstall).toBeUndefined();
    expect(manifest.postremove).toBeUndefined();
  });

  it("rejects a manifest missing \"name\" with a specific error", () => {
    const { name, ...withoutName } = VALID_MANIFEST;

    expect(() => parseManifest(withoutName)).toThrow(ManifestValidationError);
    expect(() => parseManifest(withoutName)).toThrow(/"name"/);
  });

  it("rejects a manifest missing \"version\" with a specific error", () => {
    const { version, ...withoutVersion } = VALID_MANIFEST;

    expect(() => parseManifest(withoutVersion)).toThrow(ManifestValidationError);
    expect(() => parseManifest(withoutVersion)).toThrow(/"version"/);
  });

  it("rejects a malformed targets entry (non-string destination) with a specific error", () => {
    const malformed = {
      ...VALID_MANIFEST,
      targets: { ...VALID_MANIFEST.targets, cursor: { "skills/": 123 } },
    };

    expect(() => parseManifest(malformed)).toThrow(ManifestValidationError);
    expect(() => parseManifest(malformed)).toThrow(/targets\.cursor/);
  });

  it("rejects a native-marketplace target where marketplace is not literally true", () => {
    const malformed = {
      ...VALID_MANIFEST,
      targets: { ...VALID_MANIFEST.targets, gemini: { marketplace: "yes" } },
    };

    expect(() => parseManifest(malformed)).toThrow(ManifestValidationError);
    expect(() => parseManifest(malformed)).toThrow(/targets\.gemini/);
  });
});

describe("readManifest", () => {
  it("reads and parses maui.json from a plugin directory", async () => {
    const dir = await mkdtemp(join(tmpdir(), "maui-manifest-"));
    try {
      await writeFile(join(dir, "maui.json"), JSON.stringify(VALID_MANIFEST));

      const manifest = await readManifest(dir);

      expect(manifest.name).toBe("example-plugin");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("throws ManifestValidationError when maui.json is missing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "maui-manifest-"));
    try {
      await expect(readManifest(dir)).rejects.toThrow(ManifestValidationError);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
