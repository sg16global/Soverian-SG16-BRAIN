import { db } from "@/db";
import { aiModels, newsItems } from "@/db/schema";
import { eq } from "drizzle-orm";

// The only model on this platform. Status and latency are NOT stored here: they are
// measured live (see /api/models), so nothing in this row can go stale or be invented.
const SG16_MODEL = {
  id: "sg16-brain",
  name: "SG16 Brain",
  vendor: "Sovereign Systems",
  role: "Open, independent and friendly to everyone",
  description:
    "Every message is screened by the SG16 safety gate, then answered by the Brain's own language model on the operator's own server.",
  glyph: "brain",
  accent: "#22e08c",
  status: "configured",
  latencyMs: 0,
  contextWindow: "8K chars",
  selfHosted: true,
  capabilities: ["Safety gate", "Any language", "Private by design"],
  sortOrder: 0,
};

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
    // Chat sessions reference this row, so it must exist. Older databases may still hold
    // rows for other models; they are left alone but never offered or used (see /api/models).
    const sg16 = await db.select({ id: aiModels.id }).from(aiModels).where(eq(aiModels.id, SG16_MODEL.id)).limit(1);
    if (sg16.length === 0) {
      await db.insert(aiModels).values(SG16_MODEL);
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
