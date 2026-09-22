// ===================================================================
// SG16 OLLAMA HEART-BRIDGE — server-side only.
//
// The heart of the platform can live on the operator's own metal. When the
// Q16.16 sovereign core (sg16 python runtime, :8080) is absent but a local
// Ollama daemon is present, this bridge lets the brain keep answering from
// the operator's own machine — zero vendor APIs, zero per-token cost, zero
// data leaving the host. Same doctrine as the core gateway:
//
//   * the daemon URL comes ONLY from SG16_OLLAMA_URL (never from a request)
//     and is never echoed to the client;
//   * the charter preamble is distilled in front of every turn, so the
//     heart speaks with the platform's law, not with a vendor's defaults;
//   * a hard timeout wraps every call so a stalled daemon can never pin the
//     Next.js runtime;
//   * no logging of message content, ever;
//   * honest capability reporting: a turn answered here is flagged
//     `brain: "ollama"` — never dressed up as the core.
//
// Enable by pointing SG16_OLLAMA_URL at the daemon (default is the standard
// loopback port) and setting SG16_OLLAMA_MODEL to a model already pulled:
//   ollama pull mistral
//   SG16_OLLAMA_MODEL=mistral
// ===================================================================

import { distillCharter, type CharterBody } from "./charter-prompt";
import { warmAlias } from "./warm-alias";

export type OllamaTurn = {
  /** the model that actually answered (daemon-reported) */
  model: string;
  /** assistant text */
  reply: string;
  /** wall-clock time for the whole bridge call */
  latencyMs: number;
  /** always "ollama" — the platform reports the real runtime, never a guess */
  source: "ollama";
};

export type OllamaHealth = {
  status: "online" | "offline";
  model: string;
  models?: string[];
  latencyMs?: number;
  detail?: string;
};

export type OllamaBridgeKind = "unreachable" | "http-error" | "bad-payload" | "timeout";

export class OllamaBridgeError extends Error {
  constructor(
    public kind: OllamaBridgeKind,
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "OllamaBridgeError";
  }
}

const DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434";
const DEFAULT_OLLAMA_MODEL = "mistral";
const DEFAULT_TIMEOUT_MS = 45_000;
const MAX_TURNS = 12;

/** Loopback default; overridable by the operator only. */
function ollamaBaseUrl(): string {
  return (process.env.SG16_OLLAMA_URL?.trim() || DEFAULT_OLLAMA_URL).replace(/\/+$/, "");
}

export function ollamaModel(): string {
  return process.env.SG16_OLLAMA_MODEL?.trim() || DEFAULT_OLLAMA_MODEL;
}

function ollamaTimeoutMs(): number {
  const parsed = Number(process.env.SG16_OLLAMA_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed >= 1000 ? parsed : DEFAULT_TIMEOUT_MS;
}

/** Master switch — the bridge is inert unless the operator opts in. */
export function ollamaEnabled(): boolean {
  return process.env.SG16_OLLAMA_ENABLED !== "0" && Boolean(process.env.SG16_OLLAMA_URL?.trim());
}

export type OllamaTurnInput = {
  message: string;
  /** rolling history, oldest first — kept tiny on purpose */
  history?: { role: "user" | "assistant"; content: string }[];
  body?: CharterBody;
  tier?: string;
  humanitarianRegion?: string | null;
  /** extra context injected into the system preamble (e.g. a tape snapshot) */
  context?: string | null;
};

type OllamaChatChunk = {
  message?: { role?: string; content?: string };
  model?: string;
  done?: boolean;
  error?: string;
};

/**
 * One turn through the heart-bridge: charter preamble + history + message,
 * streamed off the daemon and returned whole. Throws OllamaBridgeError so the
 * caller can degrade honestly instead of guessing.
 */
export async function ollamaChat(input: OllamaTurnInput): Promise<OllamaTurn> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ollamaTimeoutMs());

  const body: CharterBody = input.body ?? "flagship";
  const system = distillCharter(body, {
    tier: input.tier,
    humanitarianRegion: input.humanitarianRegion,
    runtime: `the local heart-bridge (Ollama, alias "${warmAlias("ollama")}")`,
    context: input.context ?? null,
  });

  const messages = [
    { role: "system", content: system },
    ...(input.history ?? []).slice(-MAX_TURNS),
    { role: "user", content: input.message },
  ];

  try {
    const res = await fetch(`${ollamaBaseUrl()}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // stream:false keeps the bridge a single awaited transaction, exactly
      // like the sovereign core's /api/ingest contract.
      body: JSON.stringify({
        model: ollamaModel(),
        messages,
        stream: false,
        options: { temperature: body === "children" ? 0.4 : 0.7 },
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!res.ok) {
      // read a bounded slice for the operator error, never the whole body
      const text = await res.text().catch(() => "");
      throw new OllamaBridgeError(
        "http-error",
        `heart-bridge answered ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`,
        res.status,
      );
    }

    const data = (await res.json()) as OllamaChatChunk;
    const reply = data.message?.content?.trim();
    if (!reply) {
      throw new OllamaBridgeError(
        "bad-payload",
        data.error ? `heart-bridge error: ${data.error.slice(0, 200)}` : "heart-bridge returned an empty reply",
      );
    }

    return {
      model: data.model ?? ollamaModel(),
      reply,
      latencyMs: Date.now() - started,
      source: "ollama",
    };
  } catch (err) {
    if (err instanceof OllamaBridgeError) throw err;
    const aborted = err instanceof Error && err.name === "AbortError";
    throw new OllamaBridgeError(
      aborted ? "timeout" : "unreachable",
      aborted ? "heart-bridge timed out" : "heart-bridge is unreachable",
    );
  } finally {
    clearTimeout(timer);
  }
}

/** Readiness probe (GET /api/tags) — cheap, also lists pulled models. */
export async function ollamaHealth(): Promise<OllamaHealth> {
  const model = ollamaModel();
  if (!ollamaEnabled()) {
    return { status: "offline", model, detail: "not configured (set SG16_OLLAMA_URL to enable)" };
  }

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(ollamaTimeoutMs(), 5_000));
  try {
    const res = await fetch(`${ollamaBaseUrl()}/api/tags`, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      return { status: "offline", model, detail: `daemon answered ${res.status}` };
    }
    const data = (await res.json()) as { models?: { name?: string }[] };
    const models = (data.models ?? [])
      .map((m) => m.name)
      .filter((n): n is string => Boolean(n));
    return {
      status: "online",
      model,
      models,
      latencyMs: Date.now() - started,
      detail: models.includes(model) ? "model present" : "daemon up — model may need `ollama pull`",
    };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return { status: "offline", model, detail: aborted ? "probe timed out" : "daemon unreachable" };
  } finally {
    clearTimeout(timer);
  }
}

/** Reporting only — always safe to expose (no URL, no credentials). */
export function ollamaTargetSummary() {
  return {
    enabled: ollamaEnabled(),
    configured: Boolean(process.env.SG16_OLLAMA_URL?.trim()),
    defaultUrl: DEFAULT_OLLAMA_URL,
    model: ollamaModel(),
    timeoutMs: ollamaTimeoutMs(),
  };
}
