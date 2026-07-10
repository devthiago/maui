import { describe, it, expect } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readRegistry, writeRegistry, registryPath } from "../../src/core/registry";
import type { Registry } from "../../src/types";

async function withTmpHome(fn: (home: string) => Promise<void>): Promise<void> {
  const home = await mkdtemp(join(tmpdir(), "maui-registry-"));
  try {
    await fn(home);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

describe("registry", () => {
  it("returns an empty registry when none exists yet", async () => {
    await withTmpHome(async (home) => {
      const registry = await readRegistry(home);
      expect(registry).toEqual({ plugins: {} });
    });
  });

  it("round-trips a written registry exactly", async () => {
    await withTmpHome(async (home) => {
      const registry: Registry = {
        plugins: {
          "example-plugin": {
            name: "example-plugin",
            source: "https://github.com/example/example-plugin",
            version: "1.0.0",
            installedAt: "2026-01-01T00:00:00.000Z",
            agents: [
              { agent: "claude-code", scope: "global", kind: "native-marketplace" },
              {
                agent: "_default",
                scope: "global",
                kind: "symlink",
                symlinks: ["/home/user/.agents/skills/foo"],
              },
            ],
          },
        },
      };

      await writeRegistry(registry, home);
      const read = await readRegistry(home);

      expect(read).toEqual(registry);
    });
  });

  it("creates ~/.maui if it doesn't exist yet when writing", async () => {
    await withTmpHome(async (home) => {
      await writeRegistry({ plugins: {} }, home);

      expect(await Bun.file(registryPath(home)).exists()).toBe(true);
    });
  });
});
