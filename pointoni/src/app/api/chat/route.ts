import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { aiModels, chatMessages, chatSessions } from "@/db/schema";
import { asc, desc, eq } from "drizzle-orm";
import { getDefaultUser } from "@/lib/seed";
import { generateReply } from "@/lib/ai-engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/chat?sessions=1          -> session list
// GET /api/chat?session=<id>        -> messages for a session
export async function GET(req: NextRequest) {
  const user = await getDefaultUser();
  const { searchParams } = new URL(req.url);
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
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    sessionId?: string | null;
    modelId?: string;
    message?: string;
  } | null;

  const message = body?.message?.trim();
  const modelId = body?.modelId || "sg16-brain";
  if (!message) {
    return NextResponse.json({ error: "Message is required." }, { status: 400 });
  }
  if (message.length > 8000) {
    return NextResponse.json({ error: "Message too long (8000 character limit)." }, { status: 413 });
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

  const historyRows = await db
    .select({ role: chatMessages.role, content: chatMessages.content })
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, sessionId))
    .orderBy(asc(chatMessages.createdAt))
    .limit(20);

  const reply = await generateReply(
    {
      id: model.id,
      name: model.name,
      vendor: model.vendor,
      selfHosted: model.selfHosted,
    },
    historyRows.slice(0, -1),
    message,
  );

  const insertedAssistant = await db
    .insert(chatMessages)
    .values({
      sessionId,
      role: "assistant",
      content: reply.content,
      modelId: model.id,
      relay: reply.relay,
      latencyMs: reply.latencyMs,
    })
    .returning();

  await db
    .update(chatSessions)
    .set({ updatedAt: new Date(), modelId: model.id })
    .where(eq(chatSessions.id, sessionId));

  return NextResponse.json({
    sessionId,
    userMessage: insertedUser[0],
    assistantMessage: insertedAssistant[0],
  });
}

// DELETE /api/chat?session=<id>
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("session");
  if (!sessionId) {
    return NextResponse.json({ error: "session id required" }, { status: 400 });
  }
  await db.delete(chatSessions).where(eq(chatSessions.id, sessionId));
  return NextResponse.json({ ok: true });
}
