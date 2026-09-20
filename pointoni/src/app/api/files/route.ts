import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { storedFiles } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { mkdir } from "fs/promises";
import path from "path";
import { createHash } from "crypto";
import { getDefaultUser } from "@/lib/seed";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UPLOAD_DIR = path.join(process.cwd(), "data", "uploads");

export async function GET() {
  const user = await getDefaultUser();
  const files = await db
    .select()
    .from(storedFiles)
    .where(eq(storedFiles.userId, user.id))
    .orderBy(desc(storedFiles.createdAt));
  return NextResponse.json({ files });
}

export async function POST(req: NextRequest) {
  const user = await getDefaultUser();
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "File exceeds 10MB pilot limit." }, { status: 413 });
  }

  await mkdir(UPLOAD_DIR, { recursive: true });
  const bytes = Buffer.from(await file.arrayBuffer());
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
  const safeName = file.name.replace(/[^a-zA-Z0-9._\-\u00C0-\u017F ]/g, "_");
  const storedName = `${hash}-${safeName}`;

  const { writeFile } = await import("fs/promises");
  await writeFile(path.join(UPLOAD_DIR, storedName), bytes);

  const created = await db
    .insert(storedFiles)
    .values({
      userId: user.id,
      name: safeName,
      mime: file.type || "application/octet-stream",
      sizeBytes: file.size,
    })
    .returning();

  return NextResponse.json({ file: { ...created[0], storedName } });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.delete(storedFiles).where(eq(storedFiles.id, id));
  return NextResponse.json({ ok: true });
}
