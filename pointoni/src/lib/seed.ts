import { db } from "@/db";
import { aiModels, newsItems, users } from "@/db/schema";
import { eq } from "drizzle-orm";

export const DEFAULT_USER_HANDLE = "pilot@sovereign.sg16";

const MODELS = [
  {
    id: "sg16-brain",
    name: "SG16 Brain",
    vendor: "Sovereign Systems",
    role: "Sovereign reasoning core",
    description:
      "Self-hosted Mistral engine by SG16 Brain \u2014 built for ownership, not dependency on third-party AI APIs.",
    glyph: "brain",
    accent: "#22e08c",
    status: "online",
    latencyMs: 42,
    contextWindow: "128K",
    selfHosted: true,
    capabilities: ["Reasoning", "Code", "Knowledge", "Orchestration"],
    sortOrder: 0,
  },
  {
    id: "mistral-x",
    name: "Mistral X Instruct",
    vendor: "Mistral AI \u00B7 SG16-hosted",
    role: "Self-hosted instruct engine",
    description:
      "Sovereign Brain \u00B7 Mistral X Instruct \u2014 open-weight inference running inside the SG16 perimeter.",
    glyph: "flame",
    accent: "#ff8a3d",
    status: "online",
    latencyMs: 68,
    contextWindow: "128K",
    selfHosted: true,
    capabilities: ["Instruct", "Long context", "Multilingual"],
    sortOrder: 1,
  },
  {
    id: "claude",
    name: "Claude",
    vendor: "Anthropic",
    role: "Advanced reasoning \u0027 analysis",
    description:
      "Relayed through the SG16 orchestrator for long-context analysis, policy work and careful reasoning.",
    glyph: "sparkles",
    accent: "#e0875a",
    status: "connected",
    latencyMs: 214,
    contextWindow: "200K",
    selfHosted: false,
    capabilities: ["Reasoning", "Analysis", "Writing"],
    sortOrder: 2,
  },
  {
    id: "gpt-5.5",
    name: "GPT-5.5",
    vendor: "OpenAI",
    role: "Multimodal general intelligence",
    description:
      "Frontier multimodal model relayed securely, with deep-runner reasoning chains.",
    glyph: "atom",
    accent: "#35d48a",
    status: "connected",
    latencyMs: 188,
    contextWindow: "256K",
    selfHosted: false,
    capabilities: ["Reasoning", "Vision", "Code", "Voice"],
    sortOrder: 3,
  },
  {
    id: "gemini",
    name: "Gemini",
    vendor: "Google DeepMind",
    role: "Deep multimodal research",
    description:
      "Research-grade multimodal intelligence for science, search and very long contexts.",
    glyph: "gem",
    accent: "#5a8dff",
    status: "connected",
    latencyMs: 246,
    contextWindow: "1M",
    selfHosted: false,
    capabilities: ["Research", "Vision", "Audio", "Code"],
    sortOrder: 4,
  },
  {
    id: "llama-3",
    name: "Llama 3",
    vendor: "Meta \u00B7 open weights",
    role: "Open-weight frontier model",
    description:
      "New Llama 3 model variants, hosted locally on SG16 infrastructure for dependency-free scaling.",
    glyph: "layers",
    accent: "#b06bff",
    status: "standby",
    latencyMs: 132,
    contextWindow: "128K",
    selfHosted: true,
    capabilities: ["Chat", "Open weights", "Fine-tuning"],
    sortOrder: 5,
  },
  {
    id: "sd-xl",
    name: "Stable Diffusion XL",
    vendor: "Stability AI",
    role: "Image synthesis node",
    description:
      "Improved image generation with refined latent detail, routed through the synthesis pipeline.",
    glyph: "image",
    accent: "#ff4fa3",
    status: "standby",
    latencyMs: 940,
    contextWindow: "1024\u00D71024",
    selfHosted: true,
    capabilities: ["Text-to-image", "Upscale", "Inpaint"],
    sortOrder: 6,
  },
];

const NEWS = [
  {
    headline:
      "GPT-5 runners intensify: Focus on reasoning, to deep-runner reasoning\u2026",
    category: "Reasoning",
    modelTag: "GPT-5",
    source: "Live AI Model Updates",
    accent: "#22e08c",
    ageMinutes: 6,
  },
  {
    headline:
      "New Llama 3 model variants announced to frontier model audiences\u2026",
    category: "Model Release",
    modelTag: "Llama 3",
    source: "Live AI Model Updates",
    accent: "#ff4fa3",
    ageMinutes: 24,
  },
  {
    headline:
      "Stable Diffusion update: Improved image generation to Stable Diffusion\u2026",
    category: "Multimodal",
    modelTag: "Stable Diffusion",
    source: "Live AI Model Updates",
    accent: "#ffd166",
    ageMinutes: 47,
  },
  {
    headline:
      "AI ethics debate heats up: Key players join discussion to discuss reasoning\u2026",
    category: "Policy",
    modelTag: "AI Ethics",
    source: "Live AI Model Updates",
    accent: "#39d7ff",
    ageMinutes: 73,
  },
  {
    headline:
      "Healthcare AI breakthrough: New diagnostics tool, and human neurocentric\u2026",
    category: "Health",
    modelTag: "Med-AI",
    source: "Live AI Model Updates",
    accent: "#2ee6a0",
    ageMinutes: 118,
  },
  {
    headline:
      "Quantum Computing and AI: Recent advances in quantum computing and\u2026",
    category: "Research",
    modelTag: "Quantum",
    source: "Live AI Model Updates",
    accent: "#ffb020",
    ageMinutes: 165,
  },
];

let seedingPromise: Promise<void> | null = null;

export async function ensureSeeded(): Promise<void> {
  if (seedingPromise) return seedingPromise;
  seedingPromise = (async () => {
    const existingUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.handle, DEFAULT_USER_HANDLE))
      .limit(1);
    if (existingUsers.length === 0) {
      await db.insert(users).values({
        handle: DEFAULT_USER_HANDLE,
        displayName: "SG16 Pilot",
        email: DEFAULT_USER_HANDLE,
        role: "developer-pilot",
      });
    }

    const existingModels = await db.select({ id: aiModels.id }).from(aiModels);
    if (existingModels.length === 0) {
      await db.insert(aiModels).values(MODELS);
    }

    const existingNews = await db.select({ id: newsItems.id }).from(newsItems).limit(1);
    if (existingNews.length === 0) {
      await db.insert(newsItems).values(
        NEWS.map((n) => ({
          headline: n.headline,
          category: n.category,
          modelTag: n.modelTag,
          source: n.source,
          accent: n.accent,
          publishedAt: new Date(Date.now() - n.ageMinutes * 60_000),
        })),
      );
    }
  })();
  try {
    await seedingPromise;
  } finally {
    seedingPromise = null;
  }
}

export async function getDefaultUser() {
  await ensureSeeded();
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.handle, DEFAULT_USER_HANDLE))
    .limit(1);
  return rows[0];
}
