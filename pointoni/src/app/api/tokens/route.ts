import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { apiTokens } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { createHash, randomBytes } from "crypto";
import { getDefaultUser } from "@/lib/seed";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const user = await getDefaultUser();
  const tokens = await db
    .select()
    .from(apiTokens)
    .where(eq(apiTokens.userId, user.id))
    .orderBy(asc(apiTokens.createdAt));
  return NextResponse.json({ tokens });
}

export async function POST(req: NextRequest) {
  const user = await getDefaultUser();
  const body = (await req.json().catch(() => ({}))) as { label?: string };
  const label = (body.label || "Developer Pilot Token").slice(0, 60);

  const secret = `sg16_${randomBytes(24).toString("hex")}`;
  const hash = createHash("sha256").update(secret).digest("hex");
  const prefix = `${secret.slice(0, 11)}\u2026${secret.slice(-4)}`;

  const created = await db
    .insert(apiTokens)
    .values({ userId: user.id, label, prefix, tokenHash: hash })
    .returning();

  return NextResponse.json({ token: created[0], secret });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.update(apiTokens).set({ revoked: true }).where(eq(apiTokens.id, id));
  return NextResponse.json({ ok: true });
}
