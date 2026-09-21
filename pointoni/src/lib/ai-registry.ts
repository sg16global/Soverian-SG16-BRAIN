// ────────────────────────────────────────────────────────────────────────────
// GLOBAL AI DIRECTORY REGISTRY
// The comprehensive registry of every major AI company and their models,
// powering the live 5-slot batch rotation on the Multi-Model Intelligence
// Grid.  Sovereign SG16 Brain is NOT part of the rotating window — it is the
// permanently anchored first item (SOVEREIGN_ANCHOR).
// ────────────────────────────────────────────────────────────────────────────

export type DirectoryModel = {
  id: string;
  name: string;
  vendor: string;
  company: string;
  role: string;
  description: string;
  glyph: string;
  accent: string;
  status: string; // online | connected | standby | degraded | offline
  latencyMs: number;
  contextWindow: string;
  selfHosted: boolean;
  origin: "global-relay" | "local-quantized";
};

/** Permanently anchored first item — never rotates, never moves. */
export const SOVEREIGN_ANCHOR: DirectoryModel = {
  id: "sg16-brain",
  name: "SG16 Brain",
  vendor: "Sovereign Systems",
  company: "SOVEREIGN",
  role: "Sovereign reasoning core",
  description:
    "Self-hosted Mistral engine by SG16 Brain — built for ownership, not dependency on third-party AI APIs.",
  glyph: "brain",
  accent: "#22e08c",
  status: "online",
  latencyMs: 42,
  contextWindow: "128K",
  selfHosted: true,
  origin: "local-quantized",
};

const O = "global-relay" as const;
const L = "local-quantized" as const;

export const AI_REGISTRY: DirectoryModel[] = [
  // ── OpenAI ────────────────────────────────────────────────────────────────
  { id: "gpt-4o", name: "GPT-4o", vendor: "OpenAI", company: "OPENAI", role: "Multimodal flagship", description: "Omni-modal frontier model — text, vision and audio in one engine.", glyph: "atom", accent: "#35d48a", status: "connected", latencyMs: 188, contextWindow: "128K", selfHosted: false, origin: O },
  { id: "gpt-4o-mini", name: "GPT-4o-mini", vendor: "OpenAI", company: "OPENAI", role: "Fast compact flagship", description: "Small, fast and affordable member of the GPT-4o family.", glyph: "atom", accent: "#35d48a", status: "connected", latencyMs: 96, contextWindow: "128K", selfHosted: false, origin: O },
  { id: "o1-preview", name: "o1-preview", vendor: "OpenAI", company: "OPENAI", role: "Deep reasoning core", description: "Chain-of-thought reasoning series for hard science and math.", glyph: "gem", accent: "#35d48a", status: "connected", latencyMs: 620, contextWindow: "128K", selfHosted: false, origin: O },
  { id: "o1-mini", name: "o1-mini", vendor: "OpenAI", company: "OPENAI", role: "Compact reasoning", description: "Faster, smaller reasoning model tuned for STEM workloads.", glyph: "gem", accent: "#35d48a", status: "connected", latencyMs: 410, contextWindow: "128K", selfHosted: false, origin: O },
  { id: "gpt-4-turbo", name: "GPT-4 Turbo", vendor: "OpenAI", company: "OPENAI", role: "Turbo general intelligence", description: "High-throughput turbo generation with the 128K window.", glyph: "atom", accent: "#35d48a", status: "standby", latencyMs: 240, contextWindow: "128K", selfHosted: false, origin: O },

  // ── Anthropic ─────────────────────────────────────────────────────────────
  { id: "claude-3-5-sonnet", name: "Claude 3.5 Sonnet", vendor: "Anthropic", company: "ANTHROPIC", role: "Balanced frontier intelligence", description: "Frontier balance of speed, price and careful reasoning.", glyph: "sparkles", accent: "#e0875a", status: "connected", latencyMs: 214, contextWindow: "200K", selfHosted: false, origin: O },
  { id: "claude-3-5-opus", name: "Claude 3.5 Opus", vendor: "Anthropic", company: "ANTHROPIC", role: "Frontier reasoning heavyweight", description: "The heavyweight Claude tier for the hardest analysis work.", glyph: "sparkles", accent: "#e0875a", status: "standby", latencyMs: 480, contextWindow: "200K", selfHosted: false, origin: O },
  { id: "claude-3-haiku", name: "Claude 3 Haiku", vendor: "Anthropic", company: "ANTHROPIC", role: "Swift compact analyst", description: "Instant-answer compact model for volume workloads.", glyph: "sparkles", accent: "#e0875a", status: "connected", latencyMs: 90, contextWindow: "200K", selfHosted: false, origin: O },
  { id: "claude-3-5-haiku", name: "Claude 3.5 Haiku", vendor: "Anthropic", company: "ANTHROPIC", role: "Fast frontier worker", description: "3.5-generation speed worker with frontier reliability.", glyph: "sparkles", accent: "#e0875a", status: "connected", latencyMs: 120, contextWindow: "200K", selfHosted: false, origin: O },

  // ── Google DeepMind ───────────────────────────────────────────────────────
  { id: "gemini-1-5-pro", name: "Gemini 1.5 Pro", vendor: "Google DeepMind", company: "GOOGLE", role: "Long-context researcher", description: "Two-million-token research window with deep multimodality.", glyph: "gem", accent: "#5a8dff", status: "connected", latencyMs: 246, contextWindow: "2M", selfHosted: false, origin: O },
  { id: "gemini-1-5-flash", name: "Gemini 1.5 Flash", vendor: "Google DeepMind", company: "GOOGLE", role: "High-speed multimodal", description: "Million-token flash tier built for throughput.", glyph: "gem", accent: "#5a8dff", status: "connected", latencyMs: 130, contextWindow: "1M", selfHosted: false, origin: O },
  { id: "gemini-2-0-ultra", name: "Gemini 2.0 Ultra", vendor: "Google DeepMind", company: "GOOGLE", role: "Frontier multimodal engine", description: "2.0-generation heavyweight for agentic multimodal work.", glyph: "gem", accent: "#5a8dff", status: "standby", latencyMs: 520, contextWindow: "2M", selfHosted: false, origin: O },
  { id: "gemini-2-0-flash", name: "Gemini 2.0 Flash", vendor: "Google DeepMind", company: "GOOGLE", role: "Agentic fast intelligence", description: "The 2.0 flash tier — fast agents with native tool use.", glyph: "gem", accent: "#5a8dff", status: "connected", latencyMs: 150, contextWindow: "1M", selfHosted: false, origin: O },
  { id: "gemini-flash-thinking", name: "Gemini Flash-Thinking", vendor: "Google DeepMind", company: "GOOGLE", role: "Chain-of-thought flash core", description: "Flash-speed reasoning with visible thinking traces.", glyph: "gem", accent: "#5a8dff", status: "standby", latencyMs: 380, contextWindow: "1M", selfHosted: false, origin: O },

  // ── DeepSeek ──────────────────────────────────────────────────────────────
  { id: "deepseek-v3", name: "DeepSeek-V3", vendor: "DeepSeek", company: "DEEPSEEK", role: "Open MoE frontier", description: "Open mixture-of-experts frontier model, 37B active params.", glyph: "layers", accent: "#4d7cff", status: "connected", latencyMs: 190, contextWindow: "64K", selfHosted: false, origin: O },
  { id: "deepseek-r1", name: "DeepSeek-R1", vendor: "DeepSeek", company: "DEEPSEEK", role: "Reasoning core", description: "Open chain-of-thought reasoning core rivaling closed labs.", glyph: "gem", accent: "#4d7cff", status: "connected", latencyMs: 540, contextWindow: "64K", selfHosted: false, origin: O },
  { id: "deepseek-coder", name: "DeepSeek-Coder", vendor: "DeepSeek", company: "DEEPSEEK", role: "Code-specialized engine", description: "The DeepSeek series tuned for heavy repository-level code.", glyph: "layers", accent: "#4d7cff", status: "standby", latencyMs: 210, contextWindow: "128K", selfHosted: false, origin: O },

  // ── Meta ──────────────────────────────────────────────────────────────────
  { id: "llama-3-3-70b", name: "Llama 3.3 70B", vendor: "Meta", company: "META", role: "Open-weight workhorse", description: "The current open-weight workhorse of the Meta Llama line.", glyph: "layers", accent: "#b06bff", status: "connected", latencyMs: 132, contextWindow: "128K", selfHosted: false, origin: O },
  { id: "llama-3-1-8b", name: "Llama 3.1 8B", vendor: "Meta", company: "META", role: "Compact open weights", description: "Small open-weight tier for edge and self-hosted fleets.", glyph: "layers", accent: "#b06bff", status: "connected", latencyMs: 60, contextWindow: "128K", selfHosted: false, origin: O },
  { id: "llama-3-405b", name: "Llama 3 405B", vendor: "Meta", company: "META", role: "Open-weight heavyweight", description: "The largest open-weight Llama — 405B parameter frontier.", glyph: "layers", accent: "#b06bff", status: "standby", latencyMs: 680, contextWindow: "128K", selfHosted: false, origin: O },

  // ── Mistral AI ────────────────────────────────────────────────────────────
  { id: "mistral-large-2", name: "Mistral Large 2", vendor: "Mistral AI", company: "MISTRAL", role: "European frontier flagship", description: "Mistral's flagship general model with strong multilingual depth.", glyph: "flame", accent: "#ff8a3d", status: "connected", latencyMs: 176, contextWindow: "128K", selfHosted: false, origin: O },
  { id: "mistral-nemo", name: "Mistral NeMo", vendor: "Mistral AI", company: "MISTRAL", role: "Compact 12B engine", description: "Compact NVIDIA-partnered 12B model for efficient serving.", glyph: "flame", accent: "#ff8a3d", status: "connected", latencyMs: 72, contextWindow: "128K", selfHosted: false, origin: O },
  { id: "codestral", name: "Codestral", vendor: "Mistral AI", company: "MISTRAL", role: "Code-specialized model", description: "Mistral's dedicated code model — fill-in-the-middle master.", glyph: "flame", accent: "#ff8a3d", status: "standby", latencyMs: 160, contextWindow: "256K", selfHosted: false, origin: O },
  { id: "pixtral", name: "Pixtral", vendor: "Mistral AI", company: "MISTRAL", role: "Vision-language engine", description: "Mistral enters multimodality with strong image understanding.", glyph: "image", accent: "#ff8a3d", status: "standby", latencyMs: 230, contextWindow: "128K", selfHosted: false, origin: O },

  // ── Other giants ──────────────────────────────────────────────────────────
  { id: "grok-2", name: "Grok 2", vendor: "xAI", company: "XAI", role: "Real-time wit engine", description: "xAI's frontier model with live knowledge of the X firehose.", glyph: "star", accent: "#ff5d73", status: "connected", latencyMs: 260, contextWindow: "128K", selfHosted: false, origin: O },
  { id: "command-r-plus", name: "Cohere Command R+", vendor: "Cohere", company: "COHERE", role: "Enterprise RAG core", description: "Enterprise retrieval and tool-use engine for grounded answers.", glyph: "shield", accent: "#39c09b", status: "connected", latencyMs: 198, contextWindow: "128K", selfHosted: false, origin: O },
  { id: "phi-4", name: "Microsoft Phi-4", vendor: "Microsoft", company: "MICROSOFT", role: "Small language heavyweight", description: "14B small-language-model punching far above its class.", glyph: "gem", accent: "#7ba7ff", status: "connected", latencyMs: 140, contextWindow: "16K", selfHosted: false, origin: O },
  { id: "qwen-2-5", name: "Qwen 2.5", vendor: "Alibaba Cloud", company: "ALIBABA", role: "Open multilingual engine", description: "Alibaba's open flagship — strong multilingual and code.", glyph: "layers", accent: "#c061ff", status: "connected", latencyMs: 154, contextWindow: "128K", selfHosted: false, origin: O },
  { id: "ernie-4", name: "Baidu Ernie 4.0", vendor: "Baidu", company: "BAIDU", role: "Chinese knowledge engine", description: "Baidu's flagship knowledge engine for the Chinese web.", glyph: "gem", accent: "#3fa9ff", status: "standby", latencyMs: 240, contextWindow: "128K", selfHosted: false, origin: O },

  // ── Local open-source · optimized quantized tiers ─────────────────────────
  { id: "local-llama-8b-q4", name: "Llama 3.1 8B Q4_K", vendor: "Local quantized", company: "LOCAL 4GB", role: "On-device 4GB quantized", description: "4GB Q4_K quantization running fully on-device.", glyph: "layers", accent: "#2ee6a0", status: "online", latencyMs: 95, contextWindow: "128K", selfHosted: true, origin: L },
  { id: "local-mistral-7b-q4", name: "Mistral 7B Q4_K", vendor: "Local quantized", company: "LOCAL 4GB", role: "On-device 4GB quantized", description: "The SG16 core lineage — 4GB Q4_K local inference.", glyph: "flame", accent: "#2ee6a0", status: "online", latencyMs: 68, contextWindow: "32K", selfHosted: true, origin: L },
  { id: "local-qwen-7b-q4", name: "Qwen 2.5 7B Q4", vendor: "Local quantized", company: "LOCAL 4GB", role: "On-device 4GB quantized", description: "4GB quantized Qwen for local multilingual work.", glyph: "layers", accent: "#2ee6a0", status: "online", latencyMs: 88, contextWindow: "128K", selfHosted: true, origin: L },
  { id: "local-phi-4-q8", name: "Phi-4 Q8", vendor: "Local quantized", company: "LOCAL 8GB", role: "Workstation 8GB quantized", description: "8GB Q8 quantization for near-lossless local Phi-4.", glyph: "gem", accent: "#2ee6a0", status: "online", latencyMs: 120, contextWindow: "16K", selfHosted: true, origin: L },
  { id: "local-deepcoder-q8", name: "DeepSeek-Coder Q8", vendor: "Local quantized", company: "LOCAL 8GB", role: "Workstation 8GB quantized", description: "8GB Q8 quantized coding engine for offline teams.", glyph: "layers", accent: "#2ee6a0", status: "online", latencyMs: 148, contextWindow: "128K", selfHosted: true, origin: L },
];

/** Total batches of 5 in the rotating global window. */
export const REGISTRY_BATCH_COUNT = Math.ceil(AI_REGISTRY.length / 5);

/**
 * The rotating global window: 5 slots per batch, sliding through the ENTIRE
 * registry.  The window wraps seamlessly, so the cycle never strands slots —
 * every model in the directory is introduced over time.
 */
export function registryBatch(batchIndex: number, size = 5): DirectoryModel[] {
  const total = AI_REGISTRY.length;
  const start = ((batchIndex * size) % total + total) % total;
  return Array.from({ length: Math.min(size, total) }, (_, i) => AI_REGISTRY[(start + i) % total]);
}

/** Rotation cadence for the global window (2–5 minute range: 3 minutes). */
export const BATCH_INTERVAL_MS = 3 * 60 * 1000;

/** Slide animation duration shared by the in/out batch keyframes. */
export const BATCH_TRANSITION_MS = 700;
