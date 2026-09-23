import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { aiModels, chatMessages, chatSessions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { resolveAccount } from "@/lib/account-auth";
import { ensureSeeded } from "@/lib/seed";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_MESSAGES = 400;
const MAX_RESTORE_BYTES = 2_000_000;

export async function POST(req: NextRequest) {
  const account = await resolveAccount(req);
  if (!account) return NextResponse.json({ error: "Sign in to restore an account capsule." }, { status: 401 });
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_RESTORE_BYTES) {
    return NextResponse.json({ error: "Capsule restore exceeds the 2 MB request limit." }, { status: 413 });
  }

  try {
    const body = (await req.json()) as {
      title?: unknown;
      messages?: unknown;
    };
    const items = (Array.isArray(body.messages) ? body.messages : [])
      .filter((message): message is { role: string; content: string; modelId?: string; createdAt?: string } =>
        !!message && typeof message === "object" &&
        typeof (message as { role?: unknown }).role === "string" &&
        typeof (message as { content?: unknown }).content === "string" &&
        (message as { content: string }).content.trim().length > 0)
      .slice(0, MAX_MESSAGES);
    if (items.length === 0) {
      return NextResponse.json({ error: "Capsule contains no restorable messages." }, { status: 400 });
    }

    await ensureSeeded();
    const model = await db.select({ id: aiModels.id }).from(aiModels).where(eq(aiModels.id, "sg16-brain")).limit(1);
    if (!model[0]) return NextResponse.json({ error: "Chat model is unavailable." }, { status: 503 });

    const title = typeof body.title === "string" ? body.title.slice(0, 80) : "restored capsule";
    const [session] = await db
      .insert(chatSessions)
      .values({ userId: account.user.id, title: title || "restored capsule", modelId: model[0].id })
      .returning();

    const restored = items.map((item) => {
      const createdAt = item.createdAt ? new Date(item.createdAt) : null;
      return {
        sessionId: session.id,
        role: item.role === "assistant" ? "assistant" : "user",
        content: item.content.slice(0, 20_000),
        modelId: model[0].id,
        relay: false,
        latencyMs: 0,
        ...(createdAt && Number.isFinite(createdAt.getTime()) ? { createdAt } : {}),
      };
    });
    await db.insert(chatMessages).values(restored);
    return NextResponse.json({ ok: true, sessionId: session.id, restored: restored.length, stored: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Capsule restore failed." },
      { status: 400 },
    );
  }
}
