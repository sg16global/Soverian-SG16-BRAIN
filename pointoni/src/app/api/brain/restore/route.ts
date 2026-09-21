import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { chatMessages, chatSessions } from "@/db/schema";
import { getDefaultUser } from "@/lib/seed";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Capsule restore — re-materialize a decrypted session the USER owns. The
// copy-of-record always stays in the user's encrypted capsule; the vault held
// here is volatile working memory so the pilot can keep conversing.

const MAX_MESSAGES = 400;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      title?: string;
      messages?: { role: string; content: string; modelId?: string; createdAt?: string }[];
    };
    const items = (Array.isArray(body.messages) ? body.messages : []).filter(
      (m) => typeof m?.role === "string" && typeof m?.content === "string" && m.content.trim(),
    );
    if (items.length === 0) {
      return NextResponse.json({ error: "capsule held no restorable messages" }, { status: 400 });
    }
    const user = await getDefaultUser();
    const title = (body.title ?? "restored capsule").slice(0, 80);

    const [session] = await db
      .insert(chatSessions)
      .values({ userId: user.id, title, modelId: "sg16-brain" })
      .returning();

    await db.insert(chatMessages).values(
      items.slice(0, MAX_MESSAGES).map((m) => ({
        sessionId: session.id,
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content.slice(0, 20_000),
        modelId: m.modelId ?? "sg16-brain",
        relay: false,
        latencyMs: 0,
        ...(m.createdAt ? { createdAt: new Date(m.createdAt) } : {}),
      })),
    );

    return NextResponse.json({ ok: true, sessionId: session.id, restored: Math.min(items.length, MAX_MESSAGES) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "restore failed" },
      { status: 500 },
    );
  }
}
