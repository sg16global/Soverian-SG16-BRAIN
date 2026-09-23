import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { tickets } from "@/db/schema";
import { desc, and, eq } from "drizzle-orm";
import { resolveAccount } from "@/lib/account-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const account = await resolveAccount(req);
  if (!account) return NextResponse.json({ error: "Sign in to view tickets." }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const kind = searchParams.get("kind");
  const rows = await db.select().from(tickets)
    .where(eq(tickets.userId, account.user.id)).orderBy(desc(tickets.createdAt));
  return NextResponse.json({ tickets: kind ? rows.filter((ticket) => ticket.kind === kind) : rows });
}

export async function POST(req: NextRequest) {
  const account = await resolveAccount(req);
  if (!account) return NextResponse.json({ error: "Sign in to submit a ticket." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as {
    kind?: unknown;
    subject?: unknown;
    bodyText?: unknown;
  } | null;
  const subject = typeof body?.subject === "string" ? body.subject.trim() : "";
  const message = typeof body?.bodyText === "string" ? body.bodyText.trim() : "";
  if (!subject || !message) return NextResponse.json({ error: "Subject and message are required." }, { status: 400 });
  if (subject.length > 140 || message.length > 4000) {
    return NextResponse.json({ error: "Subject is limited to 140 characters and message to 4,000 characters." }, { status: 413 });
  }
  const kind = body?.kind === "contact" ? "contact" : "support";
  const [created] = await db.insert(tickets).values({
    userId: account.user.id,
    kind,
    subject,
    body: message,
    status: "open",
  }).returning();
  return NextResponse.json({ ticket: created, delivery: "stored in this deployment; no email notification is configured by this route" });
}
