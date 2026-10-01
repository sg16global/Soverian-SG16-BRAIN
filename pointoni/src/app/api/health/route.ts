import { db, persistenceMode } from "@/db";
import { sql } from "drizzle-orm";
import { brainHealth } from "@/lib/brain-gateway";
import { ollamaHealth } from "@/lib/ollama-brain";
import { lastAnswer } from "@/lib/answer-ladder";
import { charterDigest } from "@/lib/charter-prompt";
import { childrenLockSummary } from "@/lib/cors-lock";

export const dynamic = "force-dynamic";

// GET /api/health — the honest operator picture:
//   database  → is the ledger actually answering
//   brain     → is the sovereign core reachable (Q16.16 runtime)
//   heart     → is the local Ollama heart-bridge configured and awake
//   charter   → which law the platform is currently speaking under
// The ladder is reported in fallback order, never as a single boast.
export async function GET() {
  let database = false;
  try {
    await db.execute(sql`select 1`);
    database = true;
  } catch {
    database = false;
  }

  let brain: "online" | "offline" = "offline";
  try {
    await brainHealth();
    brain = "online";
  } catch {
    brain = "offline";
  }

  const heart = await ollamaHealth();
  // capability, not history: clean messages go to Ollama while it is up
  const answering = heart.status === "online" ? "ollama" : brain === "online" ? "core" : "fallback-local";

  return Response.json(
    {
      ok: database,
      database,
      brain,
      persistence: persistenceMode,
      heart,
      answering,
      // what actually answered the most recent request (null until one is served)
      lastAnswered: lastAnswer(),
      engines: ["core-gate", "ollama", "core", "fallback-local"],
      charter: charterDigest(),
      children: childrenLockSummary(),
    },
    { status: database ? 200 : 500 },
  );
}
