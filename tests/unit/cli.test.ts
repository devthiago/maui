import { describe, it, expect } from "bun:test";
import { run } from "../../src/cli/index";
import { COMMANDS } from "../../src/cli/commands";

describe("maui CLI", () => {
  it("prints help text listing every v1 command when given no arguments", () => {
    const result = run([]);

    expect(result.code).toBe(0);
    for (const command of COMMANDS) {
      const name = command.split(" ")[0];
      expect(result.stdout).toContain(`maui ${name}`);
    }
  });

  it("prints help text for the explicit help command", () => {
    const result = run(["help"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Usage");
  });

  it("errors clearly on an unknown subcommand", () => {
    const result = run(["frobnicate"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('unknown command "frobnicate"');
  });
});
