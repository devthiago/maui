import { describe, it, expect } from "bun:test";
import { resolveContextFile } from "../../src/core/context-file";

describe("resolveContextFile", () => {
  it("resolves claude-code global scope to ~/.claude/CLAUDE.md", () => {
    expect(resolveContextFile("claude-code", "global", { home: "/home/user" })).toBe(
      "/home/user/.claude/CLAUDE.md"
    );
  });

  it("resolves claude-code project scope to <project>/CLAUDE.md", () => {
    expect(
      resolveContextFile("claude-code", "project", { home: "/home/user", projectRoot: "/repo" })
    ).toBe("/repo/CLAUDE.md");
  });

  it("resolves gemini global scope to ~/.gemini/GEMINI.md", () => {
    expect(resolveContextFile("gemini", "global", { home: "/home/user" })).toBe(
      "/home/user/.gemini/GEMINI.md"
    );
  });

  it("resolves gemini project scope to <project>/GEMINI.md", () => {
    expect(
      resolveContextFile("gemini", "project", { home: "/home/user", projectRoot: "/repo" })
    ).toBe("/repo/GEMINI.md");
  });

  it("resolves opencode global scope to ~/.config/opencode/AGENTS.md", () => {
    expect(resolveContextFile("opencode", "global", { home: "/home/user" })).toBe(
      "/home/user/.config/opencode/AGENTS.md"
    );
  });

  it("resolves opencode project scope to <project>/AGENTS.md", () => {
    expect(
      resolveContextFile("opencode", "project", { home: "/home/user", projectRoot: "/repo" })
    ).toBe("/repo/AGENTS.md");
  });

  it("falls back to AGENTS.md for an adapter with no confirmed convention", () => {
    expect(resolveContextFile("codex", "global", { home: "/home/user" })).toBe(
      "/home/user/AGENTS.md"
    );
    expect(resolveContextFile("some-unknown-agent", "global", { home: "/home/user" })).toBe(
      "/home/user/AGENTS.md"
    );
  });

  it("falls back to AGENTS.md at project scope too", () => {
    expect(
      resolveContextFile("codex", "project", { home: "/home/user", projectRoot: "/repo" })
    ).toBe("/repo/AGENTS.md");
  });
});
