import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { devices } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { createHash } from "crypto";
import { getDefaultUser } from "@/lib/seed";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const user = await getDefaultUser();
  const rows = await db
    .select()
    .from(devices)
    .where(eq(devices.userId, user.id))
    .orderBy(asc(devices.createdAt));
  return NextResponse.json({ devices: rows });
}

export async function POST(req: NextRequest) {
  const user = await getDefaultUser();
  const body = (await req.json().catch(() => ({}))) as {
    deviceName?: string;
    userAgent?: string;
  };
  const ua = (body.userAgent || "unknown").slice(0, 400);
  const deviceName = (body.deviceName || "Unknown Device").slice(0, 80);
  const uaHash = createHash("sha256").update(ua).digest("hex").slice(0, 16);

  const existing = await db
    .select()
    .from(devices)
    .where(eq(devices.userId, user.id));
  const match = existing.find((d) => d.userAgent.includes(uaHash) || d.deviceName === deviceName);
  if (match) {
    const updated = await db
      .update(devices)
      .set({ lastSeenAt: new Date() })
      .where(eq(devices.id, match.id))
      .returning();
    return NextResponse.json({ device: updated[0], existing: true });
  }

  const created = await db
    .insert(devices)
    .values({ userId: user.id, deviceName: `${deviceName} \u00B7 ${uaHash.slice(0, 4)}`, userAgent: `${uaHash} ${ua}` })
    .returning();
  return NextResponse.json({ device: created[0], existing: false });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.delete(devices).where(eq(devices.id, id));
  return NextResponse.json({ ok: true });
}
