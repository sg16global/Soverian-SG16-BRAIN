import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, aiModels } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getDefaultUser } from "@/lib/seed";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Preferences = {
  plan?: string;
  defaultModel?: string;
  notifications?: boolean;
};

export async function GET() {
  const user = await getDefaultUser();
  return NextResponse.json({ user });
}

export async function PUT(req: NextRequest) {
  const user = await getDefaultUser();
  const body = (await req.json().catch(() => ({}))) as {
    displayName?: string;
    email?: string;
    preferences?: Preferences;
    plan?: string;
  };

  const prefs = (user.preferences ?? {}) as Preferences;
  if (body.preferences) Object.assign(prefs, body.preferences);
  if (body.plan) prefs.plan = body.plan;

  if (prefs.defaultModel) {
    const model = await db
      .select({ id: aiModels.id })
      .from(aiModels)
      .where(eq(aiModels.id, prefs.defaultModel))
      .limit(1);
    if (model.length === 0) delete prefs.defaultModel;
  }

  const updated = await db
    .update(users)
    .set({
      displayName: body.displayName?.trim() || user.displayName,
      email: body.email?.trim() || user.email,
      preferences: prefs,
    })
    .where(eq(users.id, user.id))
    .returning();

  return NextResponse.json({ user: updated[0] });
}
