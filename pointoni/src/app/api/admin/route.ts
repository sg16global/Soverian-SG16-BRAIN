import { NextRequest, NextResponse } from "next/server";
import { db, persistenceMode } from "@/db";
import { sql } from "drizzle-orm";
import { resolveAccount } from "@/lib/account-auth";
import { brainHealth } from "@/lib/brain-gateway";
import { ollamaHealth } from "@/lib/ollama-brain";
import { charterDigest } from "@/lib/charter-prompt";
import { childrenLockSummary } from "@/lib/cors-lock";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/admin — sovereign operator dashboard data.
// Requires a verified account bearer token. No secrets are ever returned.
// If SG16_OWNER_SECRET is configured, the presence of X-SG16-Owner-Sig is
// reported as owner: true/false, but the secret itself is never echoed.
export async function GET(req: NextRequest) {
  const account = await resolveAccount(req);
  if (!account) {
    return NextResponse.json({ error: "Sign in with a verified email to access admin data." }, { status: 401 });
  }

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
  const answering = brain === "online" ? "core" : heart.status === "online" ? "ollama" : "fallback-local";

  const ownerSig = req.headers.get("X-SG16-Owner-Sig");
  const ownerConfigured = Boolean(process.env.SG16_OWNER_SECRET);
  // We do NOT verify the signature value here beyond presence — the core gate
  // owns the actual verification. We only report whether a signature was sent
  // and whether owner secret is configured, never the secret itself.
  const owner = ownerConfigured && Boolean(ownerSig);

  return NextResponse.json({
    ok: database,
    admin: {
      user: {
        id: account.user.id,
        email: account.user.email,
        handle: account.user.handle,
        role: account.user.role,
      },
      owner: { configured: ownerConfigured, presented: Boolean(ownerSig), matched: owner },
      system: {
        database,
        brain,
        persistence: persistenceMode,
        heart,
        answering,
        engines: ["core", "ollama", "fallback-local"],
        charter: charterDigest(),
        children: childrenLockSummary(),
      },
      imagery: {
        globe: "/images/globe.png",
        brain: "/images/ai-brain.jpg",
        shield: "/images/shield.png",
        emblem: "/images/emblem-base.png",
      },
      timestamp: new Date().toISOString(),
    },
  });
}
