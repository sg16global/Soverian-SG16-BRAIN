import { NextResponse } from "next/server";
import { db } from "@/db";
import { newsItems } from "@/db/schema";
import { desc } from "drizzle-orm";
import { ensureSeeded } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureSeeded();
  const items = await db
    .select()
    .from(newsItems)
    .orderBy(desc(newsItems.publishedAt))
    .limit(12);

  return NextResponse.json({ items, serverTime: new Date().toISOString() });
}
