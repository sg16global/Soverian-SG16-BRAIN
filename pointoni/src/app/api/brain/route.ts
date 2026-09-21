import { NextRequest, NextResponse } from "next/server";
import { db, persistenceMode } from "@/db";
import { aiModels, chatMessages, chatSessions } from "@/db/schema";
import { asc, desc, eq } from "drizzle-orm";
import { getDefaultUser } from "@/lib/seed";
import { generateReply } from "@/lib/ai-engine";
import { consumeBucket, resolveTier } from "@/lib/identity";
import {
  BrainGatewayError,
  MAX_BRAIN_MESSAGE_CHARS,
  brainChat,
  brainForgetSession,
  brainHealth,
} from "@/lib/brain-gateway";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// /api/brain — the sovereign chat routing point.
//
// Same request/response contract as /api/chat so the ChatPanel UI and the
// session archive stay 100% compatible, but self-hosted models are answered
// by the SG16 core itself (Q16.16 mathematics through the master door),
// reached server-side via the brain gateway. Non-self-hosted grid models keep
// their orchestrator relay behavior. If the core link is down, the request
// is still answered locally and flagged `brain: "fallback-local"` so the
// interface never strands the pilot.

type BrainSource = "core" | "fallback-local" | "relay";

// GET /api/brain?probe=health        -> core reachability + stack status
// GET /api/brain?sessions=1          -> session list
// GET /api/brain?session=<id>        -> messages for a session
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  if (searchParams.get("probe") === "health") {
    try {
      const health = await brainHealth();
      return NextResponse.json({
        ok: true,
        brain: "online",
        persistence: persistenceMode,
        core: health,
      });
    } catch (err) {
      const status = err instanceof BrainGatewayError && err.status === 429 ? 429 : 503;
      return NextResponse.json(
        {
          ok: false,
          brain: "offline",
          persistence: persistenceMode,
          error: err instanceof Error ? err.message : "core unreachable",
        },
        { status },
      );
    }
  }

  const user = await getDefaultUser();
  const sessionId = searchParams.get("session");

  if (sessionId) {
    const messages = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, sessionId))
      .orderBy(asc(chatMessages.createdAt));
    const sessions = await db
      .select()
      .from(chatSessions)
      .where(eq(chatSessions.id, sessionId))
      .limit(1);
    return NextResponse.json({ session: sessions[0] ?? null, messages });
  }

  const sessions = await db
    .select()
    .from(chatSessions)
    .where(eq(chatSessions.userId, user.id))
    .orderBy(desc(chatSessions.updatedAt))
    .limit(50);
  return NextResponse.json({ sessions });
}

// POST { sessionId?, modelId, message }
// Tier gate: free guests share a fair-use hourly bucket per device-IP; a
// bound subscriber (Bearer sovereign token) enters WORK mode automatically —
// wide personal bucket, same exclusive core, zero stored profiles.
export async function POST(req: NextRequest) {
  const tierInfo = await resolveTier(req);
  const bucket = consumeBucket(tierInfo.bucketKey, tierInfo.limit);
  const rateHeaders = {
    "X-Chat-Tier": tierInfo.tier,
    "X-RateLimit-Limit": String(tierInfo.limit),
    "X-RateLimit-Remaining": String(bucket.remaining),
  };
  if (!bucket.ok) {
    return NextResponse.json(
      {
        error:
          tierInfo.tier === "free"
            ? "Guest fair-use hour reached. The brain rests briefly — sign in with your email (free) to lift the throttle, or wait for the hour window."
            : "Work-mode hourly ceiling reached. Take a breath; it resets automatically.",
        tier: tierInfo.tier,
        retryAt: bucket.resetAt,
      },
      { status: 429, headers: rateHeaders },
    );
  }

  const body = (await req.json().catch(() => null)) as {
    sessionId?: string | null;
    modelId?: string;
    message?: string;
  } | null;

  const message = body?.message?.trim();
  const modelId = body?.modelId || "sg16-brain";
  if (!message) {
    return NextResponse.json({ error: "Message is required." }, { status: 400, headers: rateHeaders });
  }
  if (message.length > MAX_BRAIN_MESSAGE_CHARS) {
    return NextResponse.json(
      { error: `Message too long (${MAX_BRAIN_MESSAGE_CHARS} character limit).` },
      { status: 413, headers: rateHeaders },
    );
  }

  const user = await getDefaultUser();
  const modelRows = await db.select().from(aiModels).where(eq(aiModels.id, modelId)).limit(1);
  const model = modelRows[0];
  if (!model) {
    return NextResponse.json({ error: "Unknown model." }, { status: 404 });
  }

  let sessionId = body?.sessionId || null;
  if (!sessionId) {
    const created = await db
      .insert(chatSessions)
      .values({
        userId: user.id,
        title: message.slice(0, 56) + (message.length > 56 ? "\u2026" : ""),
        modelId: model.id,
      })
      .returning();
    sessionId = created[0].id;
  }

  const insertedUser = await db
    .insert(chatMessages)
    .values({ sessionId, role: "user", content: message, modelId: model.id })
    .returning();

  const started = performance.now();
  let content: string;
  let relay = false;
  let brain: BrainSource;

  if (model.selfHosted) {
    // Sovereign path: the SG16 core answers through its master door.
    try {
      const transaction = await brainChat(message, sessionId);
      content = transaction.reply;
      brain = "core";
    } catch (err) {
      // The charter guarantees patience and availability: degrade to the
      // local guard engine instead of failing the pilot, and flag it.
      const local = await generateReply(
        { id: model.id, name: model.name, vendor: model.vendor, selfHosted: true },
        [],
        message,
      );
      const detail = err instanceof BrainGatewayError ? err.message : "core link down";
      content = [
        `[SOVEREIGN GUARD \u2014 core link ${detail}. Answering on the local guard channel; reconnect the SG16 host for full Q16.16 inference.]`,
        local.content,
      ].join("\n\n");
      brain = "fallback-local";
    }
  } else {
    // External grid systems stay on the orchestrator relay path.
    const historyRows = await db
      .select({ role: chatMessages.role, content: chatMessages.content })
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, sessionId))
      .orderBy(asc(chatMessages.createdAt))
      .limit(20);
    const local = await generateReply(
      { id: model.id, name: model.name, vendor: model.vendor, selfHosted: false },
      historyRows.slice(0, -1),
      message,
    );
    content = local.content;
    relay = true;
    brain = "relay";
  }

  const latencyMs = Math.round(performance.now() - started);

  const insertedAssistant = await db
    .insert(chatMessages)
    .values({
      sessionId,
      role: "assistant",
      content,
      modelId: model.id,
      relay,
      latencyMs,
    })
    .returning();

  await db
    .update(chatSessions)
    .set({ updatedAt: new Date(), modelId: model.id })
    .where(eq(chatSessions.id, sessionId));

  return NextResponse.json(
    {
      sessionId,
      userMessage: insertedUser[0],
      assistantMessage: insertedAssistant[0],
      brain,
      tier: tierInfo.tier,
    },
    { headers: rateHeaders },
  );
}

// DELETE /api/brain?session=<id>
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("session");
  if (!sessionId) {
    return NextResponse.json({ error: "session id required" }, { status: 400 });
  }
  await db.delete(chatSessions).where(eq(chatSessions.id, sessionId));
  await brainForgetSession(sessionId);
  return NextResponse.json({ ok: true });
}
