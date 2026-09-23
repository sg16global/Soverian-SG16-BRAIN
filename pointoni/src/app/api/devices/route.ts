import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { devices } from "@/db/schema";
import { asc, and, eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { resolveAccount } from "@/lib/account-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const account = await resolveAccount(req);
  if (!account) return NextResponse.json({ error: "Sign in to view devices." }, { status: 401 });
  const rows = await db.select().from(devices)
    .where(eq(devices.userId, account.user.id)).orderBy(asc(devices.createdAt));
  return NextResponse.json({ devices: rows });
}

export async function POST(req: NextRequest) {
  const account = await resolveAccount(req);
  if (!account) return NextResponse.json({ error: "Sign in to register a device." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { deviceName?: unknown; userAgent?: unknown };
  const ua = typeof body.userAgent === "string" ? body.userAgent.slice(0, 400) : "unknown";
  const deviceName = typeof body.deviceName === "string" ? body.deviceName.trim().slice(0, 80) || "Unknown Device" : "Unknown Device";
  const uaHash = createHash("sha256").update(ua).digest("hex").slice(0, 16);
  const existing = await db.select().from(devices).where(eq(devices.userId, account.user.id));
  const match = existing.find((device) => device.userAgent.startsWith(`${uaHash} `));
  if (match) {
    const [updated] = await db.update(devices).set({ lastSeenAt: new Date() })
      .where(and(eq(devices.id, match.id), eq(devices.userId, account.user.id))).returning();
    return NextResponse.json({ device: updated, existing: true });
  }
  const [created] = await db.insert(devices).values({
    userId: account.user.id,
    deviceName: `${deviceName} · ${uaHash.slice(0, 4)}`,
    userAgent: `${uaHash} ${ua}`,
  }).returning();
  return NextResponse.json({ device: created, existing: false });
}

export async function DELETE(req: NextRequest) {
  const account = await resolveAccount(req);
  if (!account) return NextResponse.json({ error: "Sign in to remove a device." }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.delete(devices).where(and(eq(devices.id, id), eq(devices.userId, account.user.id)));
  return NextResponse.json({ ok: true });
}
