import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { apiTokens } from "@/db/schema";
import { asc, and, eq } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { resolveAccount } from "@/lib/account-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const MAX_TOKENS_PER_ACCOUNT = 10;

const safeToken = {
  id: apiTokens.id,
  label: apiTokens.label,
  prefix: apiTokens.prefix,
  lastUsedAt: apiTokens.lastUsedAt,
  revoked: apiTokens.revoked,
  createdAt: apiTokens.createdAt,
};

export async function GET(req: NextRequest) {
  const account = await resolveAccount(req);
  if (!account) return NextResponse.json({ error: "Sign in to view API tokens." }, { status: 401 });
  const tokens = await db.select(safeToken).from(apiTokens)
    .where(eq(apiTokens.userId, account.user.id)).orderBy(asc(apiTokens.createdAt));
  return NextResponse.json({ tokens });
}

export async function POST(req: NextRequest) {
  const account = await resolveAccount(req);
  if (!account) return NextResponse.json({ error: "Sign in to create an API token." }, { status: 401 });
  const existing = await db.select({ id: apiTokens.id }).from(apiTokens).where(eq(apiTokens.userId, account.user.id));
  if (existing.length >= MAX_TOKENS_PER_ACCOUNT) {
    return NextResponse.json({ error: `Maximum ${MAX_TOKENS_PER_ACCOUNT} API tokens per account.` }, { status: 409 });
  }
  const body = (await req.json().catch(() => ({}))) as { label?: unknown };
  const label = typeof body.label === "string" ? body.label.trim().slice(0, 60) || "API token" : "API token";
  const secret = `sg16_${randomBytes(24).toString("hex")}`;
  const tokenHash = createHash("sha256").update(secret).digest("hex");
  const prefix = `${secret.slice(0, 11)}…${secret.slice(-4)}`;
  const [created] = await db.insert(apiTokens).values({
    userId: account.user.id,
    label,
    prefix,
    tokenHash,
  }).returning(safeToken);
  return NextResponse.json({ token: created, secret });
}

export async function DELETE(req: NextRequest) {
  const account = await resolveAccount(req);
  if (!account) return NextResponse.json({ error: "Sign in to revoke an API token." }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const rows = await db.update(apiTokens).set({ revoked: true })
    .where(and(eq(apiTokens.id, id), eq(apiTokens.userId, account.user.id)))
    .returning({ id: apiTokens.id });
  return NextResponse.json({ ok: true, revoked: Boolean(rows[0]) });
}
