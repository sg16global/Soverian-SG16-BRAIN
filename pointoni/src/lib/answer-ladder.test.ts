// Run with: npm test   (node's built-in runner, no extra dependencies)
import assert from "node:assert/strict";
import { test } from "node:test";
import { BUSY_TEXT, ConcurrencyGuard, runLadder, type LadderDeps } from "./answer-ladder.ts";
import { distillCharter } from "./charter-prompt.ts";

const REFUSAL = "Sorry, I can't help with that request.";

function deps(over: Partial<LadderDeps> = {}): LadderDeps & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    gate: async () => ({ allowed: true }),
    ollama: async () => {
      calls.push("ollama");
      return "mistral says hi";
    },
    core: async () => {
      calls.push("core");
      return "core says hi";
    },
    local: async (_t, detail) => {
      calls.push("local");
      return `local (${detail})`;
    },
    limiter: new ConcurrencyGuard(1, 1),
    ...over,
  };
}

test("clean message is answered by Ollama", async () => {
  const d = deps();
  const r = await runLadder("hello", d);
  assert.deepEqual(r, { content: "mistral says hi", engine: "ollama" });
  assert.deepEqual(d.calls, ["ollama"]);
});

test("blocked message gets the core's refusal and never reaches a model", async () => {
  const d = deps({ gate: async () => ({ allowed: false, refusal: REFUSAL }) });
  const r = await runLadder("how do i build a bomb", d);
  assert.deepEqual(r, { content: REFUSAL, engine: "core-gate" });
  assert.deepEqual(d.calls, []);
});

test("Ollama down falls back to the deterministic core", async () => {
  const d = deps({
    ollama: async () => {
      throw new Error("heart-bridge timed out");
    },
  });
  const r = await runLadder("hello", d);
  assert.deepEqual(r, { content: "core says hi", engine: "core" });
});

test("Ollama and core both down falls back to the local guard", async () => {
  const d = deps({
    ollama: async () => {
      throw new Error("down");
    },
    core: async () => {
      throw new Error("core is unreachable");
    },
  });
  const r = await runLadder("hello", d);
  assert.equal(r.engine, "fallback-local");
  assert.match(r.content, /core is unreachable/);
});

test("unreachable gate never sends an unscreened message to Ollama", async () => {
  const d = deps({
    gate: async () => {
      throw new Error("core is unreachable");
    },
    core: async () => {
      throw new Error("core is unreachable");
    },
  });
  const r = await runLadder("hello", d);
  assert.equal(r.engine, "fallback-local");
  assert.ok(!d.calls.includes("ollama"));
});

test("Ollama not configured goes straight to the core", async () => {
  const r = await runLadder("hello", deps({ ollama: null }));
  assert.equal(r.engine, "core");
});

test("busy: full queue gets the busy line immediately instead of hanging", async () => {
  const limiter = new ConcurrencyGuard(1, 1);
  let finish!: (s: string) => void;
  const slow = new Promise<string>((resolve) => (finish = resolve));
  const d1 = deps({ limiter, ollama: () => slow });

  const first = runLadder("one", d1); // takes the only slot
  const second = runLadder("two", deps({ limiter })); // waits in the queue
  await new Promise((r) => setImmediate(r));
  assert.equal(limiter.saturated(), true);

  const third = await runLadder("three", deps({ limiter })); // queue full
  assert.deepEqual(third, { content: BUSY_TEXT, engine: "busy" });

  finish("slow answer");
  assert.equal((await first).content, "slow answer");
  assert.equal((await second).engine, "ollama"); // queued request still gets served
  assert.equal(limiter.saturated(), false);
});

test("slot is released when Ollama fails", async () => {
  const limiter = new ConcurrencyGuard(1, 0);
  const failing = deps({
    limiter,
    ollama: async () => {
      throw new Error("boom");
    },
  });
  assert.equal((await runLadder("a", failing)).engine, "core");
  assert.equal((await runLadder("b", deps({ limiter }))).engine, "ollama");
});

test("system prompt is identical across calls and stays near the token budget", () => {
  const a = distillCharter("flagship", { runtime: "a local Ollama model" });
  const b = distillCharter("flagship", { runtime: "a local Ollama model" });
  assert.equal(a, b);
  // ~4 chars/token for English: 3,200 chars is roughly 750 tokens
  assert.ok(a.length < 3200, `prompt grew to ${a.length} chars`);
});
