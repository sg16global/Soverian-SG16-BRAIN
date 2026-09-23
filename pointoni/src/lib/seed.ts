import { db } from "@/db";
import { aiModels, newsItems, users } from "@/db/schema";
import { eq } from "drizzle-orm";

export const DEFAULT_USER_HANDLE = "pilot@sovereign.sg16";

const MODELS = [
  {
    id: "sg16-brain",
    name: "SG16 Brain",
    vendor: "Sovereign Systems",
    role: "Configured structural core",
    description:
      "Deterministic structural gateway path with limited knowledge coverage; not a broad pretrained language model.",
    glyph: "brain",
    accent: "#22e08c",
    status: "configured",
    latencyMs: 0,
    contextWindow: "8K chars",
    selfHosted: true,
    capabilities: ["Structure", "Arithmetic", "Safety gate"],
    sortOrder: 0,
  },
  {
    id: "mistral-x",
    name: "Optional Ollama relay",
    vendor: "Operator-configured",
    role: "Optional local bridge",
    description:
      "Available only when the operator enables Ollama and a local model. Not enabled by default in this reference build.",
    glyph: "flame",
    accent: "#ff8a3d",
    status: "standby",
    latencyMs: 0,
    contextWindow: "depends on model",
    selfHosted: false,
    capabilities: ["Optional local relay"],
    sortOrder: 1,
  },
  {
    id: "claude",
    name: "External relay example",
    vendor: "Operator-configured provider",
    role: "Optional external path",
    description:
      "Illustrative provider slot. Availability requires operator-supplied credentials and provider connectivity; otherwise this row is not live.",
    glyph: "sparkles",
    accent: "#e0875a",
    status: "not-configured",
    latencyMs: 0,
    contextWindow: "provider-dependent",
    selfHosted: false,
    capabilities: ["External relay example"],
    sortOrder: 2,
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
