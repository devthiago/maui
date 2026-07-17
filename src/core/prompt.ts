import { createInterface, type Interface } from "node:readline";

/**
 * Deliberately not built on node:readline/promises' question() — that
 * method silently drops buffered lines between sequential calls when
 * stdin is piped (not a real TTY): confirmed hanging forever on the
 * second question of a multi-question flow, under both Bun and real
 * Node. This reads directly from the 'line' event instead, queueing
 * lines that arrive before anyone asked for them (the piped case) and
 * queueing waiters when a question is asked before its line has arrived
 * (the genuinely interactive case) — correct for both.
 */
class LineReader {
  private readonly rl: Interface;
  private readonly queue: string[] = [];
  private readonly waiters: ((line: string) => void)[] = [];

  constructor() {
    this.rl = createInterface({ input: process.stdin, output: process.stdout });
    this.rl.on("line", (line) => {
      const waiter = this.waiters.shift();
      if (waiter) {
        waiter(line);
      } else {
        this.queue.push(line);
      }
    });
  }

  ask(question: string): Promise<string> {
    process.stdout.write(question);
    if (this.queue.length > 0) {
      return Promise.resolve(this.queue.shift()!);
    }
    return new Promise((resolve) => this.waiters.push(resolve));
  }
}

let sharedReader: LineReader | undefined;

/** Prompts for one line of input. One shared reader per process. */
export function prompt(question: string): Promise<string> {
  if (!sharedReader) {
    sharedReader = new LineReader();
  }
  return sharedReader.ask(question);
}

/** Prompts for a yes/no answer, defaulting to "no" for anything else. */
export async function confirm(question: string): Promise<boolean> {
  const answer = await prompt(`${question} [y/N] `);
  return /^y(es)?$/i.test(answer.trim());
}
