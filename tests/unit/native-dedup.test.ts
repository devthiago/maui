import { describe, it, expect } from "bun:test";
import { shouldSkipNativeInstall, shouldSkipNativeRemove } from "../../src/core/native-dedup";
import type { NativeMarketplaceAdapter, Registry } from "../../src/types";

function fakeAdapter(installsWholeMarketplace?: boolean): NativeMarketplaceAdapter {
  return {
    id: "fake-agent",
    kind: "native-marketplace",
    installsWholeMarketplace,
    detect: async () => true,
    install: async () => {},
    remove: async () => {},
  };
}

describe("shouldSkipNativeInstall", () => {
  it("never skips for an adapter without installsWholeMarketplace", () => {
    const seen = new Set<string>();
    const adapter = fakeAdapter(false);

    expect(shouldSkipNativeInstall(adapter, "repo-a:fake-agent", seen)).toBe(false);
    expect(shouldSkipNativeInstall(adapter, "repo-a:fake-agent", seen)).toBe(false);
  });

  it("calls once, then skips subsequent calls for the same dedupe key when installsWholeMarketplace is set", () => {
    const seen = new Set<string>();
    const adapter = fakeAdapter(true);

    expect(shouldSkipNativeInstall(adapter, "repo-a:fake-agent", seen)).toBe(false);
    expect(shouldSkipNativeInstall(adapter, "repo-a:fake-agent", seen)).toBe(true);
    expect(shouldSkipNativeInstall(adapter, "repo-a:fake-agent", seen)).toBe(true);
  });

  it("tracks distinct dedupe keys independently", () => {
    const seen = new Set<string>();
    const adapter = fakeAdapter(true);

    expect(shouldSkipNativeInstall(adapter, "repo-a:fake-agent", seen)).toBe(false);
    expect(shouldSkipNativeInstall(adapter, "repo-b:fake-agent", seen)).toBe(false);
    expect(shouldSkipNativeInstall(adapter, "repo-a:fake-agent", seen)).toBe(true);
  });
});

describe("shouldSkipNativeRemove", () => {
  function registryWith(entries: Registry["plugins"]): Registry {
    return { plugins: entries };
  }

  it("never skips for an adapter without installsWholeMarketplace, even with a sibling present", () => {
    const registry = registryWith({
      "plugin-one": {
        name: "plugin-one",
        source: "src",
        version: "1.0.0",
        installedAt: "2026-01-01T00:00:00.000Z",
        sourceRepo: "/cache/my-toolkit",
        agents: [{ agent: "fake-agent", scope: "global", kind: "native-marketplace" }],
      },
      "plugin-two": {
        name: "plugin-two",
        source: "src",
        version: "1.0.0",
        installedAt: "2026-01-01T00:00:00.000Z",
        sourceRepo: "/cache/my-toolkit",
        agents: [{ agent: "fake-agent", scope: "global", kind: "native-marketplace" }],
      },
    });

    expect(
      shouldSkipNativeRemove(fakeAdapter(false), registry, "plugin-one", "/cache/my-toolkit", "fake-agent")
    ).toBe(false);
  });

  it("skips when a sibling entry shares sourceRepo and still lists the agent, for a installsWholeMarketplace adapter", () => {
    const registry = registryWith({
      "plugin-one": {
        name: "plugin-one",
        source: "src",
        version: "1.0.0",
        installedAt: "2026-01-01T00:00:00.000Z",
        sourceRepo: "/cache/my-toolkit",
        agents: [{ agent: "fake-agent", scope: "global", kind: "native-marketplace" }],
      },
      "plugin-two": {
        name: "plugin-two",
        source: "src",
        version: "1.0.0",
        installedAt: "2026-01-01T00:00:00.000Z",
        sourceRepo: "/cache/my-toolkit",
        agents: [{ agent: "fake-agent", scope: "global", kind: "native-marketplace" }],
      },
    });

    expect(
      shouldSkipNativeRemove(fakeAdapter(true), registry, "plugin-one", "/cache/my-toolkit", "fake-agent")
    ).toBe(true);
  });

  it("does not skip when removing the last plugin referencing that sourceRepo/agent", () => {
    const registry = registryWith({
      "plugin-one": {
        name: "plugin-one",
        source: "src",
        version: "1.0.0",
        installedAt: "2026-01-01T00:00:00.000Z",
        sourceRepo: "/cache/my-toolkit",
        agents: [{ agent: "fake-agent", scope: "global", kind: "native-marketplace" }],
      },
    });

    expect(
      shouldSkipNativeRemove(fakeAdapter(true), registry, "plugin-one", "/cache/my-toolkit", "fake-agent")
    ).toBe(false);
  });

  it("does not skip when sourceRepo is undefined (pre-migration entry)", () => {
    const registry = registryWith({
      "plugin-one": {
        name: "plugin-one",
        source: "src",
        version: "1.0.0",
        installedAt: "2026-01-01T00:00:00.000Z",
        agents: [{ agent: "fake-agent", scope: "global", kind: "native-marketplace" }],
      },
    });

    expect(
      shouldSkipNativeRemove(fakeAdapter(true), registry, "plugin-one", undefined, "fake-agent")
    ).toBe(false);
  });
});
