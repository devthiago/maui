import { describe, it, expect } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPlugin } from "../../src/cli/create";

async function withTmpDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "maui-cli-create-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("createPlugin", () => {
  it("gathers answers via the injected prompt and scaffolds the plugin", async () => {
    await withTmpDir(async (root) => {
      const targetDir = join(root, "my-plugin");
      const answers = ["my-plugin", "example-user", "An example plugin", "MIT"];
      let index = 0;
      const prompt = async () => answers[index++] ?? "";

      await createPlugin("my-plugin", { prompt, targetDir });

      const pkg = await Bun.file(join(targetDir, "package.json")).json();
      expect(pkg.name).toBe("my-plugin");
      expect(pkg.license).toBe("MIT");

      const manifest = await Bun.file(join(targetDir, "maui.json")).json();
      expect(manifest.targets["claude-code"].repo).toBe("example-user/my-plugin");
    });
  });
});
