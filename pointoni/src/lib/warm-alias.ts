// ===================================================================
// SG16 WARM ALIAS
//
// Doctrine: "The brain already speaks warmly; the child's voice is a
// presentation choice, not a new engine."
//
// Every runtime that can answer a turn gets ONE warm human alias, and every
// system-authored line the platform emits (degraded-engine notices, fair-use
// pauses, tier chip copy) is written in that same warm voice. This kills the
// bracketed-machine monotone that used to leak into the UI while keeping the
// engineering truth 100% intact — an alias never claims a capability the
// runtime does not have (charter §10 honest claims, §18 humility).
// ===================================================================

import type { CharterBody } from "./charter-prompt";

/** Runtimes that can answer a turn, in fallback order. */
export type BrainVoice = "core" | "ollama" | "fallback-local" | "relay";

export const WARM_ALIAS: Record<BrainVoice, string> = {
  core: "the sovereign core",
  ollama: "the hearth",
  "fallback-local": "the local guard",
  relay: "the relay",
};

/** Short operator-facing label (logs, /api/health) — no warmth needed. */
export const TECHNICAL_LABEL: Record<BrainVoice, string> = {
  core: "SG16 core (Q16.16)",
  ollama: "Ollama heart-bridge",
  "fallback-local": "local guard channel",
  relay: "orchestrator relay",
};

export function warmAlias(voice: BrainVoice): string {
  return WARM_ALIAS[voice];
}

/**
 * The line the platform prepends when a turn was answered by a lesser runtime.
 * Warm, first-person-plural, never a bracket, never a lie about the reason.
 */
export function warmFallbackLine(voice: BrainVoice, detail: string): string {
  if (voice === "ollama") {
    return `Answered at the hearth — the local heart-bridge is carrying today's turns while the sovereign core is out of reach (${detail}). Same law, same memory rules.`;
  }
  return `Answered by the local guard while the sovereign core is out of reach (${detail}). Warm and honest, but not the full core — reconnect the host when you can.`;
}

/** Fair-use pause, per body. Children never hear about money (charter §5). */
export function warmRateLimitLine(body: CharterBody, tier: string): string {
  if (body === "children") {
    return "I need a short rest — we can talk again in a little while. I will be right here, and I never left anything behind. 🌙";
  }
  if (tier === "work") {
    return "Work-mode ceiling reached for this hour. Nothing is lost — the window opens again on its own.";
  }
  return "The brain rests an hour — fair use. Sign in with your email (free) to lift the throttle, or come back soon. 🌙";
}

/** A warm, honest opening for a body. */
export function warmGreeting(body: CharterBody): string {
  switch (body) {
    case "children":
      return "Hello! I am your friend. Ask me anything at all — I love questions.";
    case "finance":
      return "Market desk open. Prices you see are demonstration tape — tell me what you want examined.";
    case "engine":
      return "Engine host awake. Ask about the weights, the licence, or how a body connects.";
    default:
      return "Sovereign core ready. What are we solving today?";
  }
}

/** Tier chip copy — frozen for children bodies ("FREE · FRIEND always", charter §5). */
export function tierChip(body: CharterBody, tier: string): string {
  if (body === "children") return "FREE · FRIEND";
  return tier === "work" ? "WORK" : "FREE";
}
