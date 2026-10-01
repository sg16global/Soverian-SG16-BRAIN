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

export type Engine = "core-gate" | "ollama" | "core" | "fallback-local" | "busy";

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
};

export type LadderResult = { content: string; engine: Engine };

export class ConcurrencyGuard {
  private active = 0;
  private waiting: (() => void)[] = [];

  private maxActive: number;
  private maxQueue: number;

  constructor(maxActive = 1, maxQueue = 2) {
    this.maxActive = maxActive;
    this.maxQueue = maxQueue;
  }

  /** true when a new request would be turned away immediately */
  saturated(): boolean {
    return this.active >= this.maxActive && this.waiting.length >= this.maxQueue;
  }

  /** Resolves to a release function, or null at once when the queue is full. */
  async acquire(): Promise<(() => void) | null> {
    if (this.active < this.maxActive) {
      this.active++;
      return this.releaser();
    }
    if (this.waiting.length >= this.maxQueue) return null;
    // the slot is handed over directly by release(), so `active` stays put
    await new Promise<void>((resolve) => this.waiting.push(resolve));
    return this.releaser();
  }

  private releaser(): () => void {
    let done = false;
    return () => {
      if (done) return;
      done = true;
      const next = this.waiting.shift();
      if (next) next();
      else this.active--;
    };
  }
}

export async function runLadder(text: string, deps: LadderDeps): Promise<LadderResult> {
  let gateDetail = "";
  let gateUp = true;
  try {
    const verdict = await deps.gate(text);
    if (!verdict.allowed) {
      return { content: verdict.refusal || DEFAULT_REFUSAL, engine: "core-gate" };
    }
  } catch (err) {
    gateUp = false;
    gateDetail = err instanceof Error ? err.message : "core link down";
  }

  if (gateUp && deps.ollama) {
    const release = await deps.limiter.acquire();
    if (!release) return { content: BUSY_TEXT, engine: "busy" };
    try {
      return { content: await deps.ollama(text), engine: "ollama" };
    } catch {
      // fall through to the deterministic core
    } finally {
      release();
    }
  }

  try {
    return { content: await deps.core(text), engine: "core" };
  } catch (err) {
    const detail = gateDetail || (err instanceof Error ? err.message : "core link down");
    return { content: await deps.local(text, detail), engine: "fallback-local" };
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

export const sharedLimiter = (): ConcurrencyGuard => shared().limiter;
export const recordAnswer = (engine: Engine): void => {
  shared().last = { engine, at: new Date().toISOString() };
};
export const lastAnswer = (): { engine: Engine; at: string } | null => shared().last;
