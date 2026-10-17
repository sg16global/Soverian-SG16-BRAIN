// Mistral API — the ONLY permitted backup inference route.
//
// Used exclusively when the VPS model is unreachable (tunnel down, model
// crashed, both retries failed). Same language-neutral system prompt, same
// verification by the core. No other third-party AI API exists in this code.

import type { ChatTurn } from "./prompt.ts";
import { ModelError } from "./model-client.ts";

export interface MistralConfig {
  apiKey: string;          // secret MISTRAL_API_KEY; unset => backup disabled
  model: string;           // MISTRAL_MODEL, default mistral-small-latest
  timeoutMs: number;
}

export async function callMistral(cfg: MistralConfig, messages: readonly ChatTurn[]): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  try {
    const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({ model: cfg.model, messages, stream: false }),
      signal: controller.signal,
    });
    if (!response.ok) throw new ModelError("E_UPSTREAM_STATUS");
    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") throw new ModelError("E_UPSTREAM_BODY");
    return content;
  } catch (e) {
    if (e instanceof ModelError) throw e;
    if ((e as Error)?.name === "AbortError") throw new ModelError("E_UPSTREAM_TIMEOUT");
    throw new ModelError("E_UPSTREAM_STATUS");
  } finally {
    clearTimeout(timer);
  }
}
