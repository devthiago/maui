import { describe, it, expect } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";

/**
 * Regression test for a real bug found during Task 28's manual end-to-end
 * verification: node:readline/promises' question() silently drops buffered
 * lines between sequential calls when stdin is piped (not a real TTY) —
 * confirmed under both Bun and real Node, hanging forever on the second
 * question of a multi-question prompt flow. No unit test could catch this
 * since every test injects a fake prompt/confirm function; this has to
 * actually spawn a subprocess with real piped stdin.
 */
describe("prompt()", () => {
  it("answers three sequential questions correctly from piped stdin, without hanging", async () => {
    const dir = await mkdtemp(join(tmpdir(), "maui-prompt-test-"));
    const scriptPath = join(dir, "ask-three.ts");
    try {
      await writeFile(
        scriptPath,
        `import { prompt } from "${join(import.meta.dir, "..", "..", "src", "core", "prompt.ts")}";
const a = await prompt("Q1: ");
const b = await prompt("Q2: ");
const c = await prompt("Q3: ");
console.log(JSON.stringify({ a, b, c }));
`
      );

      const result = await $`printf "one\ntwo\nthree\n" | bun run ${scriptPath}`.quiet().text();
      const jsonMatch = result.match(/\{.*\}/);

      expect(jsonMatch).not.toBeNull();
      expect(JSON.parse(jsonMatch![0])).toEqual({ a: "one", b: "two", c: "three" });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
