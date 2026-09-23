import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, aiModels } from "@/db/schema";
import { eq } from "drizzle-orm";
import { resolveAccount } from "@/lib/account-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Preferences = { defaultModel?: string; notifications?: boolean };

function publicProfile(user: typeof users.$inferSelect) {
  return {
    id: user.id,
    handle: user.handle,
    displayName: user.displayName,
    email: user.email,
    role: user.role,
    preferences: user.preferences,
    createdAt: user.createdAt,
  };
}

export async function GET(req: NextRequest) {
  const account = await resolveAccount(req);
  if (!account) return NextResponse.json({ error: "Sign in to view your profile." }, { status: 401 });
  return NextResponse.json({ user: publicProfile(account.user) });
}

export async function PUT(req: NextRequest) {
  const account = await resolveAccount(req);
  if (!account) return NextResponse.json({ error: "Sign in to update your profile." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as {
    displayName?: unknown;
    preferences?: unknown;
  } | null;
  const prefsInput = body?.preferences && typeof body.preferences === "object"
    ? body.preferences as Preferences
    : {};
  const existing = (account.user.preferences ?? {}) as Preferences;
  const preferences: Preferences = {
    defaultModel: existing.defaultModel ?? "sg16-brain",
    notifications: existing.notifications ?? false,
  };
  if (typeof prefsInput.defaultModel === "string") {
    const model = await db
      .select({ id: aiModels.id })
      .from(aiModels)
      .where(eq(aiModels.id, prefsInput.defaultModel))
      .limit(1);
    if (!model[0]) return NextResponse.json({ error: "Unknown model." }, { status: 400 });
    preferences.defaultModel = model[0].id;
  }
  if (typeof prefsInput.notifications === "boolean") preferences.notifications = prefsInput.notifications;

  const displayName = typeof body?.displayName === "string" ? body.displayName.trim().slice(0, 80) : account.user.displayName;
  const [updated] = await db
    .update(users)
    .set({ displayName: displayName || "Sovereign user", preferences })
    .where(eq(users.id, account.user.id))
    .returning();
  return NextResponse.json({ user: publicProfile(updated) });
}
