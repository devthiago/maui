import { describe, it, expect } from "bun:test";
import {
  selectPlugins,
  PluginSelectionRequiredError,
  InvalidPluginSelectionError,
} from "../../src/core/plugin-selection";
import type { MarketplaceCatalogEntry } from "../../src/core/source-mode";

const catalog: MarketplaceCatalogEntry[] = [
  { name: "plugin-one", description: "does thing one", pluginPath: "plugins/plugin-one" },
  { name: "plugin-two", description: "does thing two", pluginPath: "plugins/plugin-two" },
  { name: "plugin-three", description: "does thing three", pluginPath: "plugins/plugin-three" },
];

describe("selectPlugins", () => {
  it("selects exactly the named --plugin flags, no prompt invoked, regardless of isTTY", async () => {
    let promptCalled = false;
    const result = await selectPlugins(catalog, {
      pluginFlags: ["plugin-one", "plugin-two"],
      isTTY: true,
      prompt: async () => {
        promptCalled = true;
        return "all";
      },
    });

    expect(result.map((entry) => entry.name)).toEqual(["plugin-one", "plugin-two"]);
    expect(promptCalled).toBe(false);
  });

  it("throws InvalidPluginSelectionError for an unknown --plugin name", async () => {
    await expect(
      selectPlugins(catalog, { pluginFlags: ["not-a-real-plugin"] })
    ).rejects.toThrow(InvalidPluginSelectionError);
  });

  it("--all-plugins selects every catalog entry, no prompt invoked", async () => {
    let promptCalled = false;
    const result = await selectPlugins(catalog, {
      allPlugins: true,
      isTTY: false,
      prompt: async () => {
        promptCalled = true;
        return "";
      },
    });

    expect(result).toEqual(catalog);
    expect(promptCalled).toBe(false);
  });

  it("no flags + isTTY true + prompt returning a comma list selects those entries", async () => {
    const result = await selectPlugins(catalog, {
      isTTY: true,
      prompt: async () => "1,3",
    });

    expect(result.map((entry) => entry.name)).toEqual(["plugin-one", "plugin-three"]);
  });

  it('no flags + isTTY true + prompt returning "all" selects everything', async () => {
    const result = await selectPlugins(catalog, {
      isTTY: true,
      prompt: async () => "all",
    });

    expect(result).toEqual(catalog);
  });

  it("no flags + isTTY false throws PluginSelectionRequiredError listing every catalog name", async () => {
    await expect(selectPlugins(catalog, { isTTY: false })).rejects.toThrow(
      PluginSelectionRequiredError
    );

    try {
      await selectPlugins(catalog, { isTTY: false });
      throw new Error("expected selectPlugins to throw");
    } catch (error) {
      expect((error as Error).message).toContain("plugin-one");
      expect((error as Error).message).toContain("plugin-two");
      expect((error as Error).message).toContain("plugin-three");
    }
  });

  it("throws InvalidPluginSelectionError for an out-of-range interactive selection", async () => {
    await expect(
      selectPlugins(catalog, { isTTY: true, prompt: async () => "99" })
    ).rejects.toThrow(InvalidPluginSelectionError);
  });

  it("throws InvalidPluginSelectionError for a non-numeric interactive selection", async () => {
    await expect(
      selectPlugins(catalog, { isTTY: true, prompt: async () => "banana" })
    ).rejects.toThrow(InvalidPluginSelectionError);
  });
});
