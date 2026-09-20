import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { tickets } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { getDefaultUser } from "@/lib/seed";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = await getDefaultUser();
  const { searchParams } = new URL(req.url);
  const kind = searchParams.get("kind");
  const rows = await db
    .select()
    .from(tickets)
    .where(eq(tickets.userId, user.id))
    .orderBy(desc(tickets.createdAt));
  return NextResponse.json({
    tickets: kind ? rows.filter((t) => t.kind === kind) : rows,
  });
}

export async function POST(req: NextRequest) {
  const user = await getDefaultUser();
  const body = (await req.json().catch(() => null)) as {
    kind?: string;
    subject?: string;
    bodyText?: string;
  } | null;
  const subject = body?.subject?.trim();
  const bodyText = body?.bodyText?.trim();
  if (!body || !subject || !bodyText) {
    return NextResponse.json({ error: "Subject and message are required." }, { status: 400 });
  }
  const kind = body.kind === "contact" ? "contact" : "support";
  const created = await db
    .insert(tickets)
    .values({
      userId: user.id,
      kind,
      subject: subject.slice(0, 140),
      body: bodyText.slice(0, 4000),
      response:
        kind === "contact"
          ? "Received by the SG16 global desk. A diplomacy engineer will respond within one business day."
          : "Ticket received by the SG16 support core. Your pilot reference is tracked above; responses appear here.",
      status: "open",
    })
    .returning();
  return NextResponse.json({ ticket: created[0] });
}
