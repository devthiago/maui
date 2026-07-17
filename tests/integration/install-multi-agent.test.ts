import { describe, it, expect } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir, chmod, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installPlugin } from "../../src/cli/install";
import { removePlugin } from "../../src/cli/remove";
import { readRegistry } from "../../src/core/registry";

async function withFakeClaude(fn: (logPath: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "maui-fake-claude-multi-"));
  const logPath = join(dir, "invocations.log");
  const scriptPath = join(dir, "claude");
  await writeFile(scriptPath, `#!/bin/sh\necho "$@" >> "${logPath}"\nexit 0\n`);
  await chmod(scriptPath, 0o755);

  const originalPath = process.env.PATH;
  process.env.PATH = `${dir}:${originalPath}`;
  try {
    await fn(logPath);
  } finally {
    process.env.PATH = originalPath;
    await rm(dir, { recursive: true, force: true });
  }
}

async function withTmpHome(fn: (home: string) => Promise<void>): Promise<void> {
  const home = await mkdtemp(join(tmpdir(), "maui-install-multi-home-"));
  try {
    await fn(home);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

async function makeFixturePlugin(name: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "maui-install-multi-plugin-"));
  await writeFile(
    join(dir, "maui.json"),
    JSON.stringify({
      name,
      version: "1.0.0",
      targets: {
        "claude-code": { marketplace: true, repo: "example-user/example-plugin" },
        kiro: { "rules/": ".kiro/steering/" },
        _default: { "skills/": "skills/" },
      },
    })
  );
  await mkdir(join(dir, "rules"), { recursive: true });
  await writeFile(join(dir, "rules", "example.md"), "# Example rule\n");
  await mkdir(join(dir, "skills", "example"), { recursive: true });
  await writeFile(join(dir, "skills", "example", "SKILL.md"), "# Example\n");
  return dir;
}

describe("installPlugin multi-agent orchestration", () => {
  it("installs into every detected agent and skips undetected ones", async () => {
    await withFakeClaude(async (logPath) => {
      await withTmpHome(async (home) => {
        const source = await makeFixturePlugin("example-plugin");
        try {
          const result = await installPlugin(source, { home });

          const agentIds = result.agents.map((agent) => agent.agent).sort();
          expect(agentIds).toEqual(["_default", "claude-code"]);
          expect(result.skipped.some((entry) => entry.startsWith("kiro"))).toBe(true);

          const log = await readFile(logPath, "utf-8");
          expect(log.trim().split("\n")).toEqual([
            "plugin marketplace add example-user/example-plugin",
            "plugin install example-plugin@example-plugin",
          ]);

          expect(
            await Bun.file(join(home, ".agents", "skills", "example", "SKILL.md")).exists()
          ).toBe(true);
        } finally {
          await rm(source, { recursive: true, force: true });
        }
      });
    });
  });

  it("links into Kiro too once it's detected (~/.kiro exists)", async () => {
    await withFakeClaude(async () => {
      await withTmpHome(async (home) => {
        await mkdir(join(home, ".kiro"), { recursive: true });
        const source = await makeFixturePlugin("example-plugin");
        try {
          const result = await installPlugin(source, { home });
          const agentIds = result.agents.map((agent) => agent.agent).sort();
          expect(agentIds).toEqual(["_default", "claude-code", "kiro"]);

          expect(
            await Bun.file(join(home, ".kiro", "steering", "example.md")).exists()
          ).toBe(true);
        } finally {
          await rm(source, { recursive: true, force: true });
        }
      });
    });
  });

  it("removing the plugin runs the native uninstall command and strips symlinks", async () => {
    await withFakeClaude(async (logPath) => {
      await withTmpHome(async (home) => {
        const source = await makeFixturePlugin("example-plugin");
        try {
          await installPlugin(source, { home });
          await removePlugin("example-plugin", { home });

          const log = await readFile(logPath, "utf-8");
          expect(log.trim().split("\n")).toEqual([
            "plugin marketplace add example-user/example-plugin",
            "plugin install example-plugin@example-plugin",
            "plugin uninstall example-plugin@example-plugin",
          ]);

          const registry = await readRegistry(home);
          expect(registry.plugins["example-plugin"]).toBeUndefined();
        } finally {
          await rm(source, { recursive: true, force: true });
        }
      });
    });
  });

  it("a failing detected agent doesn't block other agents from installing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "maui-fake-claude-failing-"));
    const scriptPath = join(dir, "claude");
    await writeFile(scriptPath, '#!/bin/sh\necho "boom: repo not found" >&2\nexit 1\n');
    await chmod(scriptPath, 0o755);

    const originalPath = process.env.PATH;
    process.env.PATH = `${dir}:${originalPath}`;
    try {
      await withTmpHome(async (home) => {
        const source = await makeFixturePlugin("example-plugin");
        try {
          const result = await installPlugin(source, { home });

          expect(result.agents.some((agent) => agent.agent === "_default")).toBe(true);
          expect(
            await Bun.file(join(home, ".agents", "skills", "example", "SKILL.md")).exists()
          ).toBe(true);
          expect(result.failed.some((entry) => entry.startsWith("claude-code"))).toBe(true);
        } finally {
          await rm(source, { recursive: true, force: true });
        }
      });
    } finally {
      process.env.PATH = originalPath;
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("--agent restricts install to only the named agent(s), skipping the rest even if detected", async () => {
    await withFakeClaude(async (logPath) => {
      await withTmpHome(async (home) => {
        const source = await makeFixturePlugin("example-plugin");
        try {
          const result = await installPlugin(source, { home, agents: ["_default"] });

          expect(result.agents.map((agent) => agent.agent)).toEqual(["_default"]);
          expect(result.skipped.some((entry) => entry.startsWith("claude-code"))).toBe(true);
          expect(result.skipped.some((entry) => entry.startsWith("kiro"))).toBe(true);

          // _default's fallback was populated...
          expect(
            await Bun.file(join(home, ".agents", "skills", "example", "SKILL.md")).exists()
          ).toBe(true);
          // ...but claude-code was never attempted — the fake claude
          // script's log file was never even created.
          expect(await Bun.file(logPath).exists()).toBe(false);
        } finally {
          await rm(source, { recursive: true, force: true });
        }
      });
    });
  });
});
