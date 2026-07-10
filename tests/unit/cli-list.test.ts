import { describe, it, expect } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listPlugins } from "../../src/cli/list";
import { writeRegistry } from "../../src/core/registry";

async function withTmpHome(fn: (home: string) => Promise<void>): Promise<void> {
  const home = await mkdtemp(join(tmpdir(), "maui-list-home-"));
  try {
    await fn(home);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

describe("listPlugins", () => {
  it("prints a clear message when nothing is installed, not an error", async () => {
    await withTmpHome(async (home) => {
      const output = await listPlugins({ home });
      expect(output).toBe("No plugins installed.");
    });
  });

  it("shows an installed plugin's name, version, and agents", async () => {
    await withTmpHome(async (home) => {
      await writeRegistry(
        {
          plugins: {
            "example-plugin": {
              name: "example-plugin",
              source: "https://github.com/example/example-plugin",
              version: "1.0.0",
              installedAt: "2026-01-01T00:00:00.000Z",
              agents: [{ agent: "_default", scope: "global", kind: "symlink", symlinks: [] }],
            },
          },
        },
        home
      );

      const output = await listPlugins({ home });

      expect(output).toContain("example-plugin@1.0.0");
      expect(output).toContain("_default");
      expect(output).toContain("global");
    });
  });
});
