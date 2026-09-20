import { NextResponse } from "next/server";
import { db } from "@/db";
import { aiModels } from "@/db/schema";
import { asc } from "drizzle-orm";
import { ensureSeeded } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureSeeded();
  const models = await db
    .select({
      id: aiModels.id,
      name: aiModels.name,
      vendor: aiModels.vendor,
      role: aiModels.role,
      description: aiModels.description,
      glyph: aiModels.glyph,
      accent: aiModels.accent,
      status: aiModels.status,
      latencyMs: aiModels.latencyMs,
      contextWindow: aiModels.contextWindow,
      selfHosted: aiModels.selfHosted,
      capabilities: aiModels.capabilities,
      sortOrder: aiModels.sortOrder,
    })
    .from(aiModels)
    .orderBy(asc(aiModels.sortOrder));

  return NextResponse.json({
    models,
    serverTime: new Date().toISOString(),
  });
}
