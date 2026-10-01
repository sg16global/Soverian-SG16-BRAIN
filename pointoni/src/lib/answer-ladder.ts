// The answering ladder for self-hosted models, kept free of framework imports
// so it can be tested directly with `node --test`.
//
//   1. the core's safety gate screens the message (blocked -> core's refusal)
//   2. clean -> Mistral via the Ollama bridge, behind a concurrency guard
//   3. Ollama failed/timed out -> the deterministic core
//   4. core unreachable too -> the local guard engine
//
// If the gate itself cannot be reached, nothing is screened, so Ollama is
// skipped and the deterministic paths (which carry their own gate) answer.

import { sharedMetrics } from "./metrics.ts";

export type Engine =
  | "core-gate"
  | "ollama"
  | "core"
  | "fallback-local"
  | "busy"
  | "rate-limited"
  | "child-fallback"
  | "child-crisis";

export const BUSY_TEXT = "I'm helping someone else right now, please try again in a moment";

// only used if an older core omits `refusal`; mirrors sg16/character.py REFUSAL_TEXT
const DEFAULT_REFUSAL =
  "Sorry, I can't help with that request. The safety checks flagged it as " +
  "potentially harmful, so I won't provide instructions for it. If you share " +
  "a safer goal, I'll try to help with that.";

export type GateVerdict = { allowed: boolean; refusal?: string };

export type LadderDeps = {
  /** core introspect/gate verdict; throws when the core is unreachable */
  gate: (text: string) => Promise<GateVerdict>;
  /** Ollama answer, or null when the bridge is not enabled; throws on failure */
  ollama: ((text: string) => Promise<string>) | null;
  /** deterministic core answer; throws when the core is unreachable */
  core: (text: string) => Promise<string>;
  /** local guard engine; never throws */
  local: (text: string, detail: string) => Promise<string>;
  limiter: ConcurrencyGuard;
  /** longest a request may wait in the queue before it is told "busy" */
  queueWaitMs?: number;
  /** hard cap on one Ollama answer, enforced here even if the bridge stalls */
  ollamaTimeoutMs?: number;
  /** fires when the client goes away; a queued request then leaves the queue */
  signal?: AbortSignal;
  /** children's edition: only ever makes the ladder stricter (see child-safety.ts) */
  child?: ChildHooks;
};

export type ChildHooks = {
  /** a fixed reply for crisis / personal-data messages; the model is never asked */
  preCheck: (text: string) => LadderResult | null;
  /** shown instead of the core's adult-worded refusal */
  refusal: string;
  /** what a child may see, or null to replace it with `fallback` */
  checkOutput: (text: string, source: "ollama" | "core" | "local") => Promise<string | null>;
  fallback: string;
};

export type LadderResult = { content: string; engine: Engine };

type Waiter = { wake: () => void };

export class ConcurrencyGuard {
  private active = 0;
  private waiting: Waiter[] = [];

  private maxActive: number;
  private maxQueue: number;

  constructor(maxActive = 1, maxQueue = 2) {
    this.maxActive = maxActive;
    this.maxQueue = maxQueue;
  }

  /** current load, for the anonymous counters */
  stats(): { active: number; queued: number } {
    return { active: this.active, queued: this.waiting.length };
  }

  /** true when a new request would be turned away immediately */
  saturated(): boolean {
    return this.active >= this.maxActive && this.waiting.length >= this.maxQueue;
  }

  /**
   * Resolves to a release function, or null when the queue is full, the wait
   * outlasts `timeoutMs`, or `signal` aborts. A waiter that gives up removes
   * itself from the queue, so a later release never hands the slot to nobody.
   */
  async acquire(opts: { timeoutMs?: number; signal?: AbortSignal } = {}): Promise<(() => void) | null> {
    if (opts.signal?.aborted) return null;
    if (this.active < this.maxActive) {
      this.active++;
      return this.releaser();
    }
    if (this.waiting.length >= this.maxQueue) return null;
    // the slot is handed over directly by release(), so `active` stays put
    const granted = await new Promise<boolean>((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const waiter: Waiter = {
        wake: () => {
          cleanup();
          resolve(true);
        },
      };
      // only effective while still queued: release() removes the waiter before waking it
      const giveUp = () => {
        const i = this.waiting.indexOf(waiter);
        if (i === -1) return;
        this.waiting.splice(i, 1);
        cleanup();
        resolve(false);
      };
      const cleanup = () => {
        if (timer) clearTimeout(timer);
        opts.signal?.removeEventListener("abort", giveUp);
      };
      this.waiting.push(waiter);
      if (opts.timeoutMs !== undefined) timer = setTimeout(giveUp, opts.timeoutMs);
      opts.signal?.addEventListener("abort", giveUp, { once: true });
    });
    return granted ? this.releaser() : null;
  }

  private releaser(): () => void {
    let done = false;
    return () => {
      if (done) return;
      done = true;
      const next = this.waiting.shift();
      if (next) next.wake();
      else this.active--;
    };
  }
}

function withTimeout<T>(work: Promise<T>, ms: number | undefined): Promise<T> {
  if (ms === undefined) return work;
  let timer: ReturnType<typeof setTimeout>;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("answer timed out")), ms);
  });
  // an abandoned `work` must not surface as an unhandled rejection later
  work.catch(() => undefined);
  return Promise.race([work, limit]).finally(() => clearTimeout(timer));
}

/** For children, every answer passes checkOutput; null means "use the safe fallback". */
async function vet(
  deps: LadderDeps,
  content: string,
  engine: Engine,
  source: "ollama" | "core" | "local",
): Promise<LadderResult> {
  if (!deps.child) return { content, engine };
  const checked = await deps.child.checkOutput(content, source);
  return checked === null
    ? { content: deps.child.fallback, engine: "child-fallback" }
    : { content: checked, engine };
}

export async function runLadder(text: string, deps: LadderDeps): Promise<LadderResult> {
  if (deps.child) {
    const fixed = deps.child.preCheck(text);
    if (fixed) return fixed;
  }
  let gateDetail = "";
  let gateUp = true;
  try {
    const verdict = await deps.gate(text);
    if (!verdict.allowed) {
      return {
        content: deps.child ? deps.child.refusal : verdict.refusal || DEFAULT_REFUSAL,
        engine: "core-gate",
      };
    }
  } catch (err) {
    gateUp = false;
    gateDetail = err instanceof Error ? err.message : "core link down";
  }

  if (gateUp && deps.ollama) {
    const release = await deps.limiter.acquire({ timeoutMs: deps.queueWaitMs, signal: deps.signal });
    if (!release) return { content: BUSY_TEXT, engine: "busy" };
    try {
      const answer = await withTimeout(deps.ollama(text), deps.ollamaTimeoutMs);
      return await vet(deps, answer, "ollama", "ollama");
    } catch {
      // fall through to the deterministic core
    } finally {
      release();
    }
  }

  try {
    return await vet(deps, await deps.core(text), "core", "core");
  } catch (err) {
    const detail = gateDetail || (err instanceof Error ? err.message : "core link down");
    return await vet(deps, await deps.local(text, detail), "fallback-local", "local");
  }
}

// Process-wide state, held on globalThis so the chat route and /api/health see
// the same values even if the bundler gives each route its own module copy.
type Shared = {
  limiter: ConcurrencyGuard;
  last: { engine: Engine; at: string } | null;
};
const KEY = Symbol.for("sg16.answerLadder");
function shared(): Shared {
  const g = globalThis as unknown as Record<symbol, Shared | undefined>;
  return (g[KEY] ??= {
    limiter: new ConcurrencyGuard(
      Math.max(1, Number(process.env.SG16_ANSWER_CONCURRENCY) || 1),
      Math.max(0, Number(process.env.SG16_ANSWER_QUEUE ?? 2) || 0),
    ),
    last: null,
  });
}

/** longest a queued request waits for the single answer slot */
export const queueWaitMs = (): number => {
  const n = Number(process.env.SG16_ANSWER_QUEUE_WAIT_MS);
  return Number.isFinite(n) && n >= 1000 ? n : 60_000;
};

export const sharedLimiter = (): ConcurrencyGuard => shared().limiter;
/** `ms` only when the request spent real time being answered. */
export const recordAnswer = (engine: Engine, ms?: number): void => {
  sharedMetrics().record(engine, ms);
  // a rate-limited request was not answered by anything
  if (engine !== "rate-limited") shared().last = { engine, at: new Date().toISOString() };
};
export const answerMetrics = () => sharedMetrics().snapshot(shared().limiter.stats());
export const lastAnswer = (): { engine: Engine; at: string } | null => shared().last;
